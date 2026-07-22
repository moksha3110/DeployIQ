import { Worker } from 'bullmq';
import { enableLokiTransport, logger } from './common/logger.js';
import { runBuildPipeline } from './modules/build/pipeline.js';
import { runDeployPipeline } from './modules/kubernetes/pipeline.js';
import { snapshotAllRunningDeployments } from './modules/analysis/snapshot.js';
import { createRedisConnection } from './queues/connection.js';
import { scheduleSnapshotJob } from './queues/snapshot-queue.js';
import type { BuildJobData } from './queues/build-queue.js';
import type { DeployJobData } from './queues/deploy-queue.js';

const buildWorker = new Worker<BuildJobData>(
  'build',
  async (job) => {
    logger.info('processing build job', { deploymentId: job.data.deploymentId });
    await runBuildPipeline(job.data.deploymentId);
  },
  { connection: createRedisConnection(), concurrency: 2 },
);

const deployWorker = new Worker<DeployJobData>(
  'deploy',
  async (job) => {
    logger.info('processing deploy job', { deploymentId: job.data.deploymentId });
    await runDeployPipeline(job.data.deploymentId);
  },
  { connection: createRedisConnection(), concurrency: 2 },
);

const snapshotWorker = new Worker(
  'snapshot',
  async () => {
    await snapshotAllRunningDeployments();
  },
  { connection: createRedisConnection(), concurrency: 1 },
);

buildWorker.on('failed', (job, err) => {
  logger.error('build job failed', { deploymentId: job?.data.deploymentId, err });
});
deployWorker.on('failed', (job, err) => {
  logger.error('deploy job failed', { deploymentId: job?.data.deploymentId, err });
});
snapshotWorker.on('failed', (_job, err) => {
  logger.error('snapshot job failed', { err });
});

logger.info('worker listening on queues: build, deploy, snapshot');
void enableLokiTransport('worker');
void scheduleSnapshotJob();
