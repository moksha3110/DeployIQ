import { Worker } from 'bullmq';
import { logger } from './common/logger.js';
import { runBuildPipeline } from './modules/build/pipeline.js';
import { createRedisConnection } from './queues/connection.js';
import type { BuildJobData } from './queues/build-queue.js';

// The Kubernetes Service's Worker (consuming the `deploy` queue) is added
// in Milestone 4 — this process only handles builds until then.
const buildWorker = new Worker<BuildJobData>(
  'build',
  async (job) => {
    logger.info('processing build job', { deploymentId: job.data.deploymentId });
    await runBuildPipeline(job.data.deploymentId);
  },
  { connection: createRedisConnection(), concurrency: 2 },
);

buildWorker.on('failed', (job, err) => {
  logger.error('build job failed', { deploymentId: job?.data.deploymentId, err });
});

logger.info('worker listening on queue: build');
