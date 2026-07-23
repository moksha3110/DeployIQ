import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import type {
  DeploymentAnalysis,
  DeploymentSummary,
  HealthScoreHistoryPoint,
  PaginatedResult,
} from '@platform/shared-types';
import { HttpError } from '../../common/errors.js';
import { logger } from '../../common/logger.js';
import { prisma } from '../../prisma/client.js';
import { requireAuth } from '../auth/middleware.js';
import { computeHealthScore, LiveResourceNotFoundError } from '../analysis/health-score.js';
import { generateRecommendations } from '../analysis/recommend.js';
import { computeSecurityScore } from '../analysis/security-score.js';
import { scanIncidents } from '../analysis/incidents.js';
import { computeCostForDeployment } from '../analysis/cost.js';
import { buildTopology } from '../analysis/topology.js';
import { queryDeployment } from '../analysis/query.js';
import { AiNotConfiguredError } from '../ai/client.js';
import { getHistory, getSnapshot } from '../monitoring/metrics.js';
import { deployLimiter } from '../../common/rate-limit.js';
import { enqueueDeployJob } from '../../queues/deploy-queue.js';
import { deploymentLogChannel, redisPublisher } from '../../queues/pubsub.js';
import { createDeploymentForUser } from './create.js';
import type { LogLine } from './log.js';

export const deploymentsRouter = Router();
deploymentsRouter.use(requireAuth);

// Matches modules/kubernetes/pipeline.ts — every deployment's Deployment/
// Service/Ingress/HPA is named "app" within its own namespace, so nothing
// downstream needs the platform's internal deployment id to look it up.
const APP_NAME = 'app';

function toSummary(deployment: {
  id: string;
  repositoryId: string;
  branch: string;
  commitSha: string;
  status: DeploymentSummary['status'];
  triggeredBy: DeploymentSummary['triggeredBy'];
  publicUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DeploymentSummary {
  return {
    id: deployment.id,
    repositoryId: deployment.repositoryId,
    branch: deployment.branch,
    commitSha: deployment.commitSha,
    status: deployment.status,
    triggeredBy: deployment.triggeredBy,
    publicUrl: deployment.publicUrl,
    createdAt: deployment.createdAt.toISOString(),
    updatedAt: deployment.updatedAt.toISOString(),
  };
}

const createSchema = z.object({
  // The GitHub repo id (see RepositorySummary.id) — we upsert our own
  // Repository row from it here, the first time it's actually deployed.
  repositoryId: z.string().min(1),
  branch: z.string().min(1),
});

deploymentsRouter.post('/', deployLimiter, async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new HttpError(400, 'INVALID_BODY', 'Invalid request body', parsed.error.flatten()));
    return;
  }

  try {
    const deploymentId = await createDeploymentForUser({
      userId: req.userId!,
      githubRepoId: parsed.data.repositoryId,
      branch: parsed.data.branch,
    });
    res.status(202).json({ deploymentId });
  } catch (err) {
    next(err);
  }
});

const listQuerySchema = z.object({
  // The GitHub repo id (see RepositorySummary.id) — the frontend never
  // learns our internal Repository.id, so this is the only identifier it
  // can filter by. Resolved via the relation below.
  githubRepoId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

deploymentsRouter.get('/', async (req, res, next) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    next(new HttpError(400, 'INVALID_QUERY', 'Invalid query parameters', parsed.error.flatten()));
    return;
  }
  const { githubRepoId, page, pageSize } = parsed.data;

  try {
    const where = {
      userId: req.userId!,
      ...(githubRepoId ? { repository: { githubRepoId } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.deployment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.deployment.count({ where }),
    ]);

    const body: PaginatedResult<DeploymentSummary> = {
      items: items.map(toSummary),
      page,
      pageSize,
      total,
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

deploymentsRouter.get('/:id', async (req, res, next) => {
  try {
    const deployment = await prisma.deployment.findFirst({
      where: { id: req.params.id, userId: req.userId! },
      include: { repository: true },
    });
    if (!deployment) {
      next(new HttpError(404, 'NOT_FOUND', 'Deployment not found'));
      return;
    }
    res.json({ ...toSummary(deployment), repositoryFullName: deployment.repository.fullName });
  } catch (err) {
    next(err);
  }
});

deploymentsRouter.post('/:id/rollback', deployLimiter, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!id) {
      next(new HttpError(400, 'INVALID_PARAMS', 'Missing deployment id'));
      return;
    }
    const target = await prisma.deployment.findFirst({ where: { id, userId: req.userId! } });
    if (!target) {
      next(new HttpError(404, 'NOT_FOUND', 'Deployment not found'));
      return;
    }
    if (!target.imageTag) {
      next(
        new HttpError(
          409,
          'NO_IMAGE',
          'This deployment never finished a build — nothing to roll back to',
        ),
      );
      return;
    }

    // The image already exists (built and, if configured, pushed) — skip
    // straight to the deploy stage rather than re-running clone/build.
    const rollbackDeployment = await prisma.deployment.create({
      data: {
        repositoryId: target.repositoryId,
        userId: req.userId!,
        branch: target.branch,
        commitSha: target.commitSha,
        imageTag: target.imageTag,
        containerPort: target.containerPort,
        status: 'PUSHING',
        triggeredBy: 'ROLLBACK',
      },
    });
    await enqueueDeployJob(rollbackDeployment.id);
    res.status(202).json({ deploymentId: rollbackDeployment.id });
  } catch (err) {
    next(err);
  }
});

const metricsRangeSchema = z.object({ range: z.enum(['1h', '24h', '7d', '30d']).default('1h') });

async function findDeploymentOrFail(req: Request) {
  const id = req.params.id;
  if (!id) throw new HttpError(400, 'INVALID_PARAMS', 'Missing deployment id');
  const deployment = await prisma.deployment.findFirst({
    where: { id, userId: req.userId! },
  });
  if (!deployment) throw new HttpError(404, 'NOT_FOUND', 'Deployment not found');
  if (!deployment.namespace) {
    throw new HttpError(409, 'NOT_DEPLOYED', 'This deployment has no running namespace yet');
  }
  return deployment;
}

deploymentsRouter.get('/:id/metrics', async (req, res, next) => {
  try {
    const deployment = await findDeploymentOrFail(req);
    const snapshot = await getSnapshot(deployment.namespace!);
    res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

deploymentsRouter.get('/:id/metrics/history', async (req, res, next) => {
  const parsed = metricsRangeSchema.safeParse(req.query);
  if (!parsed.success) {
    next(new HttpError(400, 'INVALID_QUERY', 'Invalid query parameters', parsed.error.flatten()));
    return;
  }
  try {
    const deployment = await findDeploymentOrFail(req);
    const history = await getHistory(deployment.namespace!, parsed.data.range);
    res.json(history);
  } catch (err) {
    next(err);
  }
});

deploymentsRouter.get('/:id/health', async (req, res, next) => {
  try {
    const deployment = await findDeploymentOrFail(req);
    const health = await computeHealthScore(deployment.namespace!, APP_NAME);
    res.json(health);
  } catch (err) {
    if (err instanceof LiveResourceNotFoundError) {
      next(new HttpError(409, 'NOT_LIVE', err.message));
      return;
    }
    next(err);
  }
});

const healthHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(2000).default(200),
});

deploymentsRouter.get('/:id/health/history', async (req, res, next) => {
  const parsed = healthHistoryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    next(new HttpError(400, 'INVALID_QUERY', 'Invalid query parameters', parsed.error.flatten()));
    return;
  }
  try {
    const deployment = await findDeploymentOrFail(req);
    const rows = await prisma.deploymentSnapshot.findMany({
      where: { deploymentId: deployment.id },
      orderBy: { createdAt: 'asc' },
      take: parsed.data.limit,
    });
    const body: HealthScoreHistoryPoint[] = rows.map((row) => ({
      timestamp: row.createdAt.toISOString(),
      score: row.healthScore,
      restarts: row.restarts,
      availableReplicas: row.availableReplicas,
      desiredReplicas: row.desiredReplicas,
    }));
    res.json(body);
  } catch (err) {
    next(err);
  }
});

deploymentsRouter.get('/:id/recommendations', async (req, res, next) => {
  try {
    const deployment = await findDeploymentOrFail(req);
    const result = await generateRecommendations(deployment.namespace!, APP_NAME);
    res.json(result);
  } catch (err) {
    if (err instanceof LiveResourceNotFoundError) {
      next(new HttpError(409, 'NOT_LIVE', err.message));
      return;
    }
    next(err);
  }
});

deploymentsRouter.get('/:id/security', async (req, res, next) => {
  try {
    const deployment = await findDeploymentOrFail(req);
    const result = await computeSecurityScore(deployment.namespace!, APP_NAME);
    res.json(result);
  } catch (err) {
    if (err instanceof LiveResourceNotFoundError) {
      next(new HttpError(409, 'NOT_LIVE', err.message));
      return;
    }
    next(err);
  }
});

deploymentsRouter.get('/:id/incidents', async (req, res, next) => {
  try {
    const deployment = await findDeploymentOrFail(req);
    await scanIncidents(deployment.id, deployment.namespace!, APP_NAME);
    const incidents = await prisma.incident.findMany({
      where: { deploymentId: deployment.id },
      orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }],
      take: 50,
    });
    res.json(
      incidents.map((incident) => ({
        id: incident.id,
        type: incident.type,
        status: incident.status,
        priority: incident.priority,
        rootCause: incident.rootCause,
        recommendedAction: incident.recommendedAction,
        occurrenceCount: incident.occurrenceCount,
        firstSeenAt: incident.firstSeenAt.toISOString(),
        lastSeenAt: incident.lastSeenAt.toISOString(),
        resolvedAt: incident.resolvedAt ? incident.resolvedAt.toISOString() : null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

deploymentsRouter.get('/:id/cost', async (req, res, next) => {
  try {
    const deployment = await findDeploymentOrFail(req);
    const cost = await computeCostForDeployment(deployment.namespace!, APP_NAME);
    res.json(cost);
  } catch (err) {
    if (err instanceof LiveResourceNotFoundError) {
      next(new HttpError(409, 'NOT_LIVE', err.message));
      return;
    }
    next(err);
  }
});

deploymentsRouter.get('/:id/topology', async (req, res, next) => {
  try {
    const deployment = await findDeploymentOrFail(req);
    const withRepo = await prisma.deployment.findUniqueOrThrow({
      where: { id: deployment.id },
      include: { repository: true },
    });
    const graph = await buildTopology(
      deployment.namespace!,
      APP_NAME,
      withRepo.repository.fullName,
      deployment.branch,
      deployment.commitSha,
    );
    res.json(graph);
  } catch (err) {
    if (err instanceof LiveResourceNotFoundError) {
      next(new HttpError(409, 'NOT_LIVE', err.message));
      return;
    }
    next(err);
  }
});

const queryBodySchema = z.object({ question: z.string().min(1).max(500) });

deploymentsRouter.post('/:id/query', async (req, res, next) => {
  const parsed = queryBodySchema.safeParse(req.body);
  if (!parsed.success) {
    next(new HttpError(400, 'INVALID_BODY', 'Invalid request body', parsed.error.flatten()));
    return;
  }
  try {
    const deployment = await findDeploymentOrFail(req);
    const withRepo = await prisma.deployment.findUniqueOrThrow({
      where: { id: deployment.id },
      include: { repository: true },
    });
    const answer = await queryDeployment(
      {
        deploymentId: deployment.id,
        namespace: deployment.namespace!,
        appName: APP_NAME,
        repositoryFullName: withRepo.repository.fullName,
        branch: deployment.branch,
        commitSha: deployment.commitSha,
      },
      parsed.data.question,
    );
    res.json({ answer, aiConfigured: true });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      res.json({ answer: '', aiConfigured: false });
      return;
    }
    next(err);
  }
});

deploymentsRouter.get('/:id/analysis', async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!id) {
      next(new HttpError(400, 'INVALID_PARAMS', 'Missing deployment id'));
      return;
    }
    const deployment = await prisma.deployment.findFirst({ where: { id, userId: req.userId! } });
    if (!deployment) {
      next(new HttpError(404, 'NOT_FOUND', 'Deployment not found'));
      return;
    }

    const analysis = await prisma.aIAnalysis.findFirst({
      where: { deploymentId: id },
      orderBy: { createdAt: 'desc' },
    });
    if (!analysis) {
      next(new HttpError(404, 'NOT_FOUND', 'No AI analysis for this deployment'));
      return;
    }

    const body: DeploymentAnalysis = {
      rootCause: analysis.rootCause,
      suggestedFixes: analysis.suggestedFixes as string[],
      likelyConfigIssue: analysis.likelyConfigIssue,
      confidence: analysis.confidence,
      createdAt: analysis.createdAt.toISOString(),
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

deploymentsRouter.get('/:id/logs', async (req, res, next) => {
  try {
    const deployment = await prisma.deployment.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!deployment) {
      next(new HttpError(404, 'NOT_FOUND', 'Deployment not found'));
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (line: LogLine) => res.write(`data: ${JSON.stringify(line)}\n\n`);

    const persisted = await prisma.deploymentLog.findMany({
      where: { deploymentId: deployment.id },
      orderBy: { timestamp: 'asc' },
    });
    for (const row of persisted) {
      send({
        stage: row.stage,
        level: row.level,
        message: row.message,
        timestamp: row.timestamp.toISOString(),
      });
    }

    const subscriber = redisPublisher.duplicate();
    // ioredis emits 'error' on a closed/closing connection (e.g. the client
    // disconnecting mid-teardown below) — without a listener, that's an
    // unhandled EventEmitter error and takes the whole process down.
    subscriber.on('error', (err) =>
      logger.error('log subscriber error', { deploymentId: deployment.id, err }),
    );
    await subscriber.subscribe(deploymentLogChannel(deployment.id));
    subscriber.on('message', (_channel: string, message: string) =>
      res.write(`data: ${message}\n\n`),
    );

    req.on('close', () => {
      subscriber.disconnect();
    });
  } catch (err) {
    next(err);
  }
});
