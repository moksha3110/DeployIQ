import { coreApi, networkingApi } from '../kubernetes/client.js';
import { getLiveDeploymentSpec, getLivePods } from '../kubernetes/inspect.js';

export type TopologyNodeType =
  | 'repository'
  | 'cluster'
  | 'namespace'
  | 'deployment'
  | 'pod'
  | 'service'
  | 'ingress'
  | 'configmap'
  | 'secret';

export type TopologyStatus = 'healthy' | 'warning' | 'error' | 'unknown';

export interface TopologyNode {
  id: string;
  type: TopologyNodeType;
  label: string;
  status: TopologyStatus;
  details: Record<string, string | number | boolean | null>;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
}

export interface TopologyGraph {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

// Every namespace gets these auto-created by Kubernetes itself, regardless
// of what this platform deploys — surfacing them as if they were part of
// the application's own config would just be noise.
const AUTO_CONFIGMAP_NAMES = new Set(['kube-root-ca.crt']);
const AUTO_SECRET_TYPES = new Set(['kubernetes.io/service-account-token']);

export async function buildTopology(
  namespace: string,
  appName: string,
  repositoryFullName: string,
  branch: string,
  commitSha: string,
): Promise<TopologyGraph> {
  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];
  let edgeId = 0;
  const link = (source: string, target: string) => edges.push({ id: `e${edgeId++}`, source, target });

  nodes.push({
    id: 'repository',
    type: 'repository',
    label: repositoryFullName,
    status: 'healthy',
    details: { branch, commitSha: commitSha.slice(0, 7) },
  });
  nodes.push({
    id: 'cluster',
    type: 'cluster',
    label: 'Kubernetes Cluster',
    status: 'healthy',
    details: {},
  });
  nodes.push({
    id: 'namespace',
    type: 'namespace',
    label: namespace,
    status: 'healthy',
    details: {},
  });
  link('repository', 'cluster');
  link('cluster', 'namespace');

  const [spec, pods] = await Promise.all([
    getLiveDeploymentSpec(namespace, appName),
    getLivePods(namespace, appName),
  ]);

  const deploymentStatus: TopologyStatus =
    spec.availableReplicas === spec.desiredReplicas && spec.desiredReplicas > 0
      ? 'healthy'
      : spec.availableReplicas > 0
        ? 'warning'
        : 'error';
  nodes.push({
    id: 'deployment',
    type: 'deployment',
    label: appName,
    status: deploymentStatus,
    details: {
      image: spec.image,
      replicas: `${spec.availableReplicas}/${spec.desiredReplicas}`,
      hpa: spec.hasHpa,
      pdb: spec.hasPdb,
    },
  });
  link('namespace', 'deployment');

  for (const pod of pods) {
    const podId = `pod-${pod.name}`;
    const podStatus: TopologyStatus = pod.badReason
      ? 'error'
      : pod.ready
        ? 'healthy'
        : 'warning';
    nodes.push({
      id: podId,
      type: 'pod',
      label: pod.name,
      status: podStatus,
      details: { phase: pod.phase, restarts: pod.restartCount, reason: pod.badReason },
    });
    link('deployment', podId);
  }

  try {
    const serviceRes = await coreApi.readNamespacedService(appName, namespace);
    const service = serviceRes.body;
    nodes.push({
      id: 'service',
      type: 'service',
      label: appName,
      status: 'healthy',
      details: {
        type: service.spec?.type ?? 'ClusterIP',
        clusterIP: service.spec?.clusterIP ?? null,
        port: service.spec?.ports?.[0]?.port ?? null,
      },
    });
    link('deployment', 'service');

    try {
      const ingressRes = await networkingApi.readNamespacedIngress(appName, namespace);
      const ingress = ingressRes.body;
      nodes.push({
        id: 'ingress',
        type: 'ingress',
        label: appName,
        status: 'healthy',
        details: { host: ingress.spec?.rules?.[0]?.host ?? null },
      });
      link('service', 'ingress');
    } catch {
      // No Ingress — fine, the Service itself is still reachable via
      // port-forward (see common/cluster-forward.ts).
    }
  } catch {
    // No Service found for this deployment — legitimate mid-rollout state.
  }

  const [configMaps, secrets] = await Promise.all([
    coreApi.listNamespacedConfigMap(namespace),
    coreApi.listNamespacedSecret(namespace),
  ]);

  for (const cm of configMaps.body.items) {
    const name = cm.metadata?.name;
    if (!name || AUTO_CONFIGMAP_NAMES.has(name)) continue;
    nodes.push({
      id: `configmap-${name}`,
      type: 'configmap',
      label: name,
      status: 'healthy',
      details: { keys: Object.keys(cm.data ?? {}).join(', ') || 'none' },
    });
    link('namespace', `configmap-${name}`);
  }

  for (const secret of secrets.body.items) {
    const name = secret.metadata?.name;
    if (!name || AUTO_SECRET_TYPES.has(secret.type ?? '')) continue;
    nodes.push({
      id: `secret-${name}`,
      type: 'secret',
      label: name,
      status: 'healthy',
      details: { type: secret.type ?? 'Opaque', keys: Object.keys(secret.data ?? {}).length },
    });
    link('namespace', `secret-${name}`);
  }

  return { nodes, edges };
}
