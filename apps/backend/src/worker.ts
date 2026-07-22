import { logger } from './common/logger.js';

// BullMQ queue consumers (Build Service, Kubernetes Service) are wired here
// starting Milestone 3. Placeholder so `npm run dev:worker` is a real,
// runnable command from Milestone 0 onward instead of appearing later with
// no history of its own.
logger.info('worker starting (no queues wired yet — see Milestone 3)');
