import { Queue } from 'bullmq';
import { createRedisConnection } from './connection.js';

export interface DeployJobData {
  deploymentId: string;
}

// No consumer yet — the Kubernetes Service (Milestone 4) adds the Worker
// that processes this queue. Jobs enqueued before then simply wait; BullMQ
// persists them in Redis, so nothing is lost by defining the producer side
// first.
export const deployQueue = new Queue<DeployJobData>('deploy', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 60 * 60 * 24 },
    removeOnFail: { age: 60 * 60 * 24 * 7 },
  },
});

export async function enqueueDeployJob(deploymentId: string): Promise<void> {
  await deployQueue.add('deploy', { deploymentId });
}
