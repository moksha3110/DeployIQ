import { Queue } from 'bullmq';
import { createRedisConnection } from './connection.js';

export interface BuildJobData {
  deploymentId: string;
}

export const buildQueue = new Queue<BuildJobData>('build', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 1, // retrying a partially-built image isn't safe without more
    // idempotency work than this milestone covers — surface the failure
    // instead of silently retrying.
    removeOnComplete: { age: 60 * 60 * 24 }, // 1 day
    removeOnFail: { age: 60 * 60 * 24 * 7 }, // keep failures a week for debugging
  },
});

export async function enqueueBuildJob(deploymentId: string): Promise<void> {
  await buildQueue.add('build', { deploymentId });
}
