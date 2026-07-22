import { logger } from '../../common/logger.js';
import { prisma } from '../../prisma/client.js';
import { computeHealthScore, LiveResourceNotFoundError } from './health-score.js';

const APP_NAME = 'app';

// Runs on a BullMQ repeatable schedule (see queues/snapshot-queue.ts), not
// per-request — health scoring hits both the Kubernetes API and Prometheus,
// so computing it on every dashboard poll would multiply load for no
// benefit. Every RUNNING deployment gets one row every 5 minutes regardless
// of whether anyone has the dashboard open, which is what makes the 24h/7d
// trend views (Milestone 11.6) meaningful.
export async function snapshotAllRunningDeployments(): Promise<void> {
  const deployments = await prisma.deployment.findMany({
    where: { status: 'RUNNING', namespace: { not: null } },
    select: { id: true, namespace: true },
  });

  for (const deployment of deployments) {
    try {
      const health = await computeHealthScore(deployment.namespace!, APP_NAME);
      await prisma.deploymentSnapshot.create({
        data: {
          deploymentId: deployment.id,
          healthScore: health.score,
          cpuCores: health.metrics.cpuCores,
          memoryBytes: health.metrics.memoryBytes,
          restarts: health.metrics.restarts,
          desiredReplicas: health.metrics.desiredReplicas,
          availableReplicas: health.metrics.availableReplicas,
        },
      });
    } catch (err) {
      // A single deployment's namespace having been torn down mid-scan (or
      // any other live-cluster hiccup) shouldn't stop the rest of the batch
      // from being snapshotted.
      if (!(err instanceof LiveResourceNotFoundError)) {
        logger.error('snapshot failed for deployment', { deploymentId: deployment.id, err });
      }
    }
  }
}
