import { appsApi, autoscalingApi, coreApi, networkingApi, policyApi } from './client.js';

// Read-back layer for M11: everything the deploy pipeline only ever writes
// (manifests.ts/apply.ts), this module reads back from the live cluster so
// analysis features (health score, recommendations, security, cost) work
// off ground truth rather than assuming the manifest we generated is still
// what's actually running.

export interface LiveResources {
  requests: { cpu: string | null; memory: string | null };
  limits: { cpu: string | null; memory: string | null };
}

export interface LiveSecurityContext {
  runAsNonRoot: boolean | null;
  privileged: boolean | null;
  allowPrivilegeEscalation: boolean | null;
  readOnlyRootFilesystem: boolean | null;
}

export interface LiveDeploymentSpec {
  image: string | null;
  imageTag: string | null;
  desiredReplicas: number;
  availableReplicas: number;
  resources: LiveResources | null;
  hasReadinessProbe: boolean;
  hasLivenessProbe: boolean;
  hasHpa: boolean;
  hasPdb: boolean;
  securityContext: LiveSecurityContext;
  hasHostPathVolume: boolean;
}

export interface LivePodStatus {
  name: string;
  phase: string;
  ready: boolean;
  restartCount: number;
  // Reason from a waiting/terminated containerStatus, e.g.
  // "CrashLoopBackOff", "ImagePullBackOff", "OOMKilled" — null when healthy.
  badReason: string | null;
}

// Namespace still exists (or never existed) but the Deployment inside it is
// gone — a legitimate state (deployment stopped/superseded), not an error.
export class LiveResourceNotFoundError extends Error {}

export async function getLiveDeploymentSpec(
  namespace: string,
  appName: string,
): Promise<LiveDeploymentSpec> {
  let deployment;
  try {
    const res = await appsApi.readNamespacedDeployment(appName, namespace);
    deployment = res.body;
  } catch {
    throw new LiveResourceNotFoundError(`No Deployment ${appName} in namespace ${namespace}`);
  }

  const container = deployment.spec?.template.spec?.containers[0];
  const resources: LiveResources | null = container?.resources
    ? {
        requests: {
          cpu: container.resources.requests?.cpu ?? null,
          memory: container.resources.requests?.memory ?? null,
        },
        limits: {
          cpu: container.resources.limits?.cpu ?? null,
          memory: container.resources.limits?.memory ?? null,
        },
      }
    : null;

  let hasHpa = false;
  try {
    await autoscalingApi.readNamespacedHorizontalPodAutoscaler(appName, namespace);
    hasHpa = true;
  } catch {
    hasHpa = false;
  }

  let hasPdb = false;
  try {
    const pdbs = await policyApi.listNamespacedPodDisruptionBudget(namespace);
    hasPdb = pdbs.body.items.length > 0;
  } catch {
    hasPdb = false;
  }

  const imageTag = container?.image?.includes(':')
    ? (container.image.split(':').pop() ?? null)
    : null; // no ':' at all means Docker will resolve it as "latest"

  // Kubernetes lets a container-level securityContext override the pod-level
  // one field-by-field; container wins where set, pod-level is the fallback.
  const podSecurityContext = deployment.spec?.template.spec?.securityContext;
  const containerSecurityContext = container?.securityContext;
  const securityContext: LiveSecurityContext = {
    runAsNonRoot:
      containerSecurityContext?.runAsNonRoot ?? podSecurityContext?.runAsNonRoot ?? null,
    privileged: containerSecurityContext?.privileged ?? null,
    allowPrivilegeEscalation: containerSecurityContext?.allowPrivilegeEscalation ?? null,
    readOnlyRootFilesystem: containerSecurityContext?.readOnlyRootFilesystem ?? null,
  };

  const hasHostPathVolume = !!deployment.spec?.template.spec?.volumes?.some((v) => v.hostPath);

  return {
    image: container?.image ?? null,
    imageTag,
    desiredReplicas: deployment.spec?.replicas ?? 0,
    availableReplicas: deployment.status?.availableReplicas ?? 0,
    resources,
    hasReadinessProbe: !!container?.readinessProbe,
    hasLivenessProbe: !!container?.livenessProbe,
    hasHpa,
    hasPdb,
    securityContext,
    hasHostPathVolume,
  };
}

export async function getServiceType(namespace: string, appName: string): Promise<string | null> {
  try {
    const res = await coreApi.readNamespacedService(appName, namespace);
    return res.body.spec?.type ?? 'ClusterIP';
  } catch {
    return null;
  }
}

export async function hasNetworkPolicy(namespace: string): Promise<boolean> {
  const res = await networkingApi.listNamespacedNetworkPolicy(namespace);
  return res.body.items.length > 0;
}

export async function getLivePods(namespace: string, appName: string): Promise<LivePodStatus[]> {
  const res = await coreApi.listNamespacedPod(
    namespace,
    undefined,
    undefined,
    undefined,
    undefined,
    `app=${appName}`,
  );

  return res.body.items.map((pod) => {
    const containerStatus = pod.status?.containerStatuses?.[0];
    const badReason =
      containerStatus?.state?.waiting?.reason ??
      containerStatus?.state?.terminated?.reason ??
      containerStatus?.lastState?.terminated?.reason ??
      null;

    return {
      name: pod.metadata?.name ?? 'unknown',
      phase: pod.status?.phase ?? 'Unknown',
      ready: containerStatus?.ready ?? false,
      restartCount: containerStatus?.restartCount ?? 0,
      badReason,
    };
  });
}
