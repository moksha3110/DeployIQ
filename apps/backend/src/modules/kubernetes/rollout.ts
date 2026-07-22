import { appsApi, coreApi } from './client.js';

export class RolloutFailedError extends Error {}
export class RolloutTimeoutError extends Error {}

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 3 * 60 * 1000;

async function findCrashingPod(namespace: string, appName: string): Promise<string | null> {
  const { body: pods } = await coreApi.listNamespacedPod(
    namespace,
    undefined,
    undefined,
    undefined,
    undefined,
    `app=${appName}`,
  );

  for (const pod of pods.items) {
    for (const status of pod.status?.containerStatuses ?? []) {
      const waitingReason = status.state?.waiting?.reason;
      if (waitingReason === 'CrashLoopBackOff' || waitingReason === 'ImagePullBackOff') {
        return `${pod.metadata?.name}: ${waitingReason} — ${status.state?.waiting?.message ?? 'no message'}`;
      }
    }
  }
  return null;
}

// Polls rather than watches (the Kubernetes watch API) — simpler to reason
// about for a bounded, one-shot "did this rollout succeed" check, at the
// cost of a little latency vs. a true watch. Worth revisiting if this ever
// needs to track many concurrent rollouts efficiently.
export async function waitForRollout(namespace: string, appName: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const { body: deployment } = await appsApi.readNamespacedDeployment(appName, namespace);
    const desired = deployment.spec?.replicas ?? 1;
    const available = deployment.status?.availableReplicas ?? 0;

    if (available >= desired) return;

    const crashReason = await findCrashingPod(namespace, appName);
    if (crashReason) {
      throw new RolloutFailedError(`Pod is crash-looping: ${crashReason}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new RolloutTimeoutError(`Rollout did not become available within ${TIMEOUT_MS / 1000}s`);
}
