import { createRedisConnection } from './connection.js';

// Separate from the BullMQ connections: pub/sub and normal Redis commands
// don't mix well on one ioredis instance (SUBSCRIBE puts a connection into
// a mode where it can only run pub/sub commands).
export const redisPublisher = createRedisConnection();

export function deploymentLogChannel(deploymentId: string): string {
  return `deployment-logs:${deploymentId}`;
}
