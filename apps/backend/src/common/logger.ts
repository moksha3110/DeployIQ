import winston from 'winston';
import { createClusterForward } from './cluster-forward.js';
import { SimpleLokiTransport } from './loki-transport.js';
import { env } from '../config/env.js';

// JSON in every environment: local dev reads it through `pino-pretty`-style
// tooling if desired, but the real reason is that this is the exact shape
// Loki/Grafana expect (see enableLokiTransport below) — no format switch
// needed later.
export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'backend' },
  transports: [new winston.transports.Console()],
});

const getLokiBaseUrl = createClusterForward('monitoring', 'loki', 3100);

// Not called at module load — reaching Loki requires an async kubectl
// port-forward (see common/cluster-forward.ts). Called once from
// server.ts/worker.ts's startup instead; logs before it resolves simply go
// to the console only, nothing is lost, and a Loki outage never blocks
// logging since the Console transport stays regardless.
export async function enableLokiTransport(process: 'server' | 'worker'): Promise<void> {
  if (!env.LOKI_ENABLED) return;

  try {
    const host = await getLokiBaseUrl();
    logger.add(new SimpleLokiTransport({ host, labels: { service: 'backend', process } }));
    logger.info('Loki transport enabled', { host });
  } catch (err) {
    logger.error('Failed to enable Loki transport — continuing with console logging only', { err });
  }
}
