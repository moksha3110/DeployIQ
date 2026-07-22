import { Worker } from 'bullmq';
import { enableLokiTransport, logger } from './common/logger.js';
import { runBuildPipeline } from './modules/build/pipeline.js';
import { runDeployPipeline } from './modules/kubernetes/pipeline.js';
import { createRedisConnection } from './queues/connection.js';
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

buildWorker.on('failed', (job, err) => {
  logger.error('build job failed', { deploymentId: job?.data.deploymentId, err });
});
deployWorker.on('failed', (job, err) => {
  logger.error('deploy job failed', { deploymentId: job?.data.deploymentId, err });
});

logger.info('worker listening on queues: build, deploy');
void enableLokiTransport('worker');
