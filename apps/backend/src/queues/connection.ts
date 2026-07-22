import { Redis } from 'ioredis';
import { env } from '../config/env.js';

// BullMQ requires maxRetriesPerRequest: null on the connection it's given —
// otherwise ioredis gives up retrying blocking commands (BLPOP etc.) under
// load, which BullMQ relies on to wait for jobs.
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}
