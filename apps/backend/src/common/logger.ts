import winston from 'winston';
import { env } from '../config/env.js';

// JSON in every environment: local dev reads it through `pino-pretty`-style
// tooling if desired, but the real reason is that this is the exact shape
// Loki/Grafana expect in Milestone 10 — no format switch needed later.
export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'backend' },
  transports: [new winston.transports.Console()],
});
