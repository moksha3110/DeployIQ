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
            httpGet: { path: /, port: 3000 }
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /, port: 3000 }
            initialDelaySeconds: 15
            periodSeconds: 10
```

`containerPort` and probe path are detected per-project-type (Milestone 3);
default `3000`/`/` with an override via a `platform.yaml` file at the repo
root if present, falling back to the default if the app doesn't respond on
`/` within the probe window (documented as a known limitation, not silently
"fixed" with a longer timeout).

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

After `apply`, the Kubernetes Service watches the `Deployment`'s status
conditions (via the Kubernetes watch API, not polling in a loop) until either:

- `availableReplicas == spec.replicas` and the newest `ReplicaSet` is fully
  rolled out → mark `RUNNING`.
- A timeout (default 3 minutes) or a pod enters `CrashLoopBackOff` → mark
  `DEPLOY_FAILED`, capture the last N container log lines + pod events, hand
  off to the AI Analysis Service.

## Isolation notes (explicitly out of scope for MVP, called out for interviews)

Multi-tenant isolation beyond namespace + resource limits (e.g.,
`NetworkPolicy` denying cross-namespace traffic, `PodSecurityStandards`
enforcement, gVisor/Kata for kernel isolation) is a known gap for a project
that lets users run arbitrary containers. Worth naming explicitly rather than
implying this is production-multi-tenant-safe: it isn't, and saying so is
more credible than pretending otherwise.
