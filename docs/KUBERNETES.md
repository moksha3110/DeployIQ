# Kubernetes Resource Design

## Namespacing

Every deployment gets its own namespace: `deploy-<deploymentId[:8]>`. Rationale
is in [ARCHITECTURE.md](./ARCHITECTURE.md#5-why-per-deployment-namespaces).
Namespaces are labeled for traceability and cleanup:

```yaml
metadata:
  labels:
    platform.dev/repository-id: '<repositoryId>'
    platform.dev/deployment-id: '<deploymentId>'
    platform.dev/user-id: '<userId>'
```

## Resources generated per deployment

| Resource                  | Purpose                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `Namespace`               | Isolation boundary + cleanup unit.                                   |
| `ConfigMap`               | Non-secret env vars.                                                 |
| `Secret`                  | Secret env vars, decrypted from Postgres just-in-time, never logged. |
| `Deployment`              | The workload: image, replicas, resource requests/limits, probes.     |
| `Service`                 | Stable `ClusterIP` in front of the pods.                             |
| `Ingress`                 | Public routing, host `<repo-slug>-<short-id>.<platform-domain>`.     |
| `HorizontalPodAutoscaler` | CPU-based autoscaling, min/max replicas.                             |

`ConfigMap`/`Secret` aren't generated yet — they depend on the repo env-var
management endpoints (`PUT /repos/:id/env` in [API.md](./API.md)), which
haven't been built. Deployed apps currently get no env vars beyond what's
baked into the image. Tracked as a gap, not silently skipped.

## Example: generated Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: deploy-a1b2c3d4
  labels:
    app: app
    platform.dev/deployment-id: a1b2c3d4-...
spec:
  replicas: 1
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      containers:
        - name: app
          image: docker.io/<user>/<repo>:<commitSha>
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef: { name: app-config }
            - secretRef: { name: app-secrets }
          resources:
            requests: { cpu: '100m', memory: '128Mi' }
            limits: { cpu: '500m', memory: '512Mi' }
          readinessProbe:
            tcpSocket: { port: 3000 }
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            tcpSocket: { port: 3000 }
            initialDelaySeconds: 15
            periodSeconds: 10
```

**Implemented as `tcpSocket`, not `httpGet`** (a deliberate change from the
original plan below): we don't know what path an arbitrary repo's app
actually serves on, or whether it returns a 2xx there — an API-only service
with no `/` route would fail an `httpGet` probe while being perfectly
healthy. A TCP-level check is the honest floor of what auto-detection can
promise without per-repo configuration (a `platform.yaml` override, listed
as a stretch goal, is the real fix for apps where "the port accepts a
connection" isn't good enough evidence of health).

`containerPort` is detected in the Build stage (Milestone 3): parsed from
the repo's own `Dockerfile` `EXPOSE` line when one exists, falling back to
`3000` (`80` for the static/nginx template) when it doesn't, and persisted
on the `Deployment` row so the Kubernetes Service doesn't need the
(already-deleted) build workspace to know it.

## Example: generated HPA

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: app
  namespace: deploy-a1b2c3d4
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: app
  minReplicas: 1
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

## Example: generated Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app
  namespace: deploy-a1b2c3d4
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: 'false' # local/minikube
spec:
  ingressClassName: nginx
  rules:
    - host: myrepo-a1b2c3d4.platform.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app
                port:
                  number: 80
```

## Rollout verification

After `apply`, the Kubernetes Service watches the `Deployment` until either:

- `availableReplicas >= spec.replicas` → mark `RUNNING`.
- A pod enters `CrashLoopBackOff`/`ImagePullBackOff`, or a 3-minute timeout
  elapses → mark `DEPLOY_FAILED`. Capturing container logs + pod events for
  the AI Analysis Service is Milestone 6's job, not this one's — for now the
  crash reason string is logged and shown in the UI, which is enough to
  debug by hand.

**Implemented as polling** (`readNamespacedDeployment` every 2s), not a
Kubernetes watch: simpler to reason about for a bounded, one-shot check, at
the cost of a little latency. Worth revisiting if this ever needs to track
many concurrent rollouts efficiently — a watch scales better than N pollers.

## Local access: `kubectl port-forward`, not the Ingress

The `Ingress` above is generated and applied for architectural parity with
a production cluster, but making its host actually resolve on a developer's
machine would require an OS hosts-file entry we have no business editing
automatically. The URL actually shown in the UI comes from a `kubectl
port-forward` process the Kubernetes Service spawns against the `Service`
after a healthy rollout — works identically on Minikube or any other
cluster reachable via kubeconfig, no DNS required. Known limitation: the
port-forward process lives only as long as the worker process does: a
worker restart drops it silently until the next redeploy. Reconciling
port-forwards on worker startup is a reasonable follow-up, not done yet.

## Local images: `minikube image load`

When no registry is configured (see `ImageRegistry` in
[ARCHITECTURE.md](./ARCHITECTURE.md)), the image built on the host's Docker
daemon isn't visible to Minikube's own container runtime — they're separate
Docker instances. The Kubernetes Service runs `minikube image load <tag>`
before applying manifests in that case, and sets `imagePullPolicy: Never`
so the kubelet doesn't try (and fail) to pull from a registry that was
never pushed to.

## Isolation notes (explicitly out of scope for MVP, called out for interviews)

Multi-tenant isolation beyond namespace + resource limits (e.g.,
`NetworkPolicy` denying cross-namespace traffic, `PodSecurityStandards`
enforcement, gVisor/Kata for kernel isolation) is a known gap for a project
that lets users run arbitrary containers. Worth naming explicitly rather than
implying this is production-multi-tenant-safe: it isn't, and saying so is
more credible than pretending otherwise.
