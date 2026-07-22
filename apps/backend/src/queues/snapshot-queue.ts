import { Queue } from 'bullmq';
import { createRedisConnection } from './connection.js';

// Single repeatable job, not one enqueue per deployment — the processor
// (worker.ts) fans out to every RUNNING deployment itself. This keeps the
// schedule in one place instead of re-registering a repeat job per
// deployment as they're created/torn down.
export const snapshotQueue = new Queue('snapshot', {
  connection: createRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: { age: 60 * 60 * 24 },
    removeOnFail: { age: 60 * 60 * 24 * 7 },
  },
});

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export async function scheduleSnapshotJob(): Promise<void> {
  await snapshotQueue.add(
    'scan',
    {},
    { repeat: { every: FIVE_MINUTES_MS }, jobId: 'snapshot-scan' },
  );
}
