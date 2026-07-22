import type {
  V1Deployment,
  V1Ingress,
  V1Namespace,
  V1Service,
  V2HorizontalPodAutoscaler,
} from '@kubernetes/client-node';

export interface ManifestInput {
  namespace: string;
  appName: string; // label/selector + resource name within the namespace
  image: string;
  containerPort: number;
  imagePullPolicy: 'Never' | 'IfNotPresent';
  ingressHost: string;
}

export function buildNamespace(input: ManifestInput): V1Namespace {
  return {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: { name: input.namespace },
  };
}

export function buildDeployment(input: ManifestInput): V1Deployment {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: input.appName, namespace: input.namespace, labels: { app: input.appName } },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: input.appName } },
      template: {
        metadata: { labels: { app: input.appName } },
        spec: {
          containers: [
            {
              name: input.appName,
              image: input.image,
              imagePullPolicy: input.imagePullPolicy,
              ports: [{ containerPort: input.containerPort }],
              resources: {
                requests: { cpu: '100m', memory: '128Mi' },
                limits: { cpu: '500m', memory: '512Mi' },
              },
              readinessProbe: {
                tcpSocket: { port: input.containerPort },
                initialDelaySeconds: 5,
                periodSeconds: 5,
              },
              livenessProbe: {
                tcpSocket: { port: input.containerPort },
                initialDelaySeconds: 15,
                periodSeconds: 10,
              },
            },
          ],
        },
      },
    },
  };
}

export function buildService(input: ManifestInput): V1Service {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: input.appName, namespace: input.namespace },
    spec: {
      selector: { app: input.appName },
      ports: [{ port: 80, targetPort: input.containerPort }],
    },
  };
}

export function buildIngress(input: ManifestInput): V1Ingress {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: input.appName,
      namespace: input.namespace,
      annotations: { 'nginx.ingress.kubernetes.io/ssl-redirect': 'false' },
    },
    spec: {
      ingressClassName: 'nginx',
      rules: [
        {
          host: input.ingressHost,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: { service: { name: input.appName, port: { number: 80 } } },
              },
            ],
          },
        },
      ],
    },
  };
}

export function buildHpa(input: ManifestInput): V2HorizontalPodAutoscaler {
  return {
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscaler',
    metadata: { name: input.appName, namespace: input.namespace },
    spec: {
      scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: input.appName },
      minReplicas: 1,
      maxReplicas: 5,
      metrics: [
        {
          type: 'Resource',
          resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 70 } },
        },
      ],
    },
  };
}
