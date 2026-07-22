import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import type { HealthResponse } from '@platform/shared-types';
import { env } from './config/env.js';
import { logger } from './common/logger.js';
import { errorHandler, notFoundHandler } from './common/errors.js';
import { authRouter } from './modules/auth/router.js';
import { githubRouter } from './modules/github/router.js';

const app = express();

app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    service: 'backend',
    timestamp: new Date().toISOString(),
  };
  res.json(body);
});

// Feature routers (deployments, monitoring) are mounted here as their
// milestones land — kept as a single flat list rather than nested sub-apps
// so the full route surface stays visible from this one file.
app.use('/api/auth', authRouter);
app.use('/api/repos', githubRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`backend listening on port ${env.PORT}`);
});
