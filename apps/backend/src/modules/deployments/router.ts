import { Router } from 'express';
import { z } from 'zod';
import type { DeploymentSummary, PaginatedResult } from '@platform/shared-types';
import { decrypt } from '../../common/crypto.js';
import { HttpError } from '../../common/errors.js';
import { prisma } from '../../prisma/client.js';
import { requireAuth } from '../auth/middleware.js';
import { fetchBranchCommitSha, fetchRepository } from '../github/client.js';
import { enqueueBuildJob } from '../../queues/build-queue.js';
import { deploymentLogChannel, redisPublisher } from '../../queues/pubsub.js';
import type { LogLine } from './log.js';

export const deploymentsRouter = Router();
deploymentsRouter.use(requireAuth);

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

deploymentsRouter.post('/', async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    next(new HttpError(400, 'INVALID_BODY', 'Invalid request body', parsed.error.flatten()));
    return;
  }

  try {
    const userId = req.userId!;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const accessToken = decrypt(user.accessTokenEncrypted);

    const githubRepo = await fetchRepository(accessToken, parsed.data.repositoryId);
    const commitSha = await fetchBranchCommitSha(
      accessToken,
      githubRepo.fullName,
      parsed.data.branch,
    );

    const repository = await prisma.repository.upsert({
      where: { githubRepoId: githubRepo.id },
      create: {
        githubRepoId: githubRepo.id,
        userId,
        name: githubRepo.name,
        fullName: githubRepo.fullName,
        defaultBranch: githubRepo.defaultBranch,
        isPrivate: githubRepo.isPrivate,
      },
      update: {
        name: githubRepo.name,
        fullName: githubRepo.fullName,
        defaultBranch: githubRepo.defaultBranch,
        isPrivate: githubRepo.isPrivate,
      },
    });

    const deployment = await prisma.deployment.create({
      data: {
        repositoryId: repository.id,
        userId,
        branch: parsed.data.branch,
        commitSha,
        status: 'PENDING',
        triggeredBy: 'MANUAL',
      },
    });

    await enqueueBuildJob(deployment.id);
    res.status(202).json({ deploymentId: deployment.id });
  } catch (err) {
    next(err);
  }
});

const listQuerySchema = z.object({
  repositoryId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

deploymentsRouter.get('/', async (req, res, next) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    next(new HttpError(400, 'INVALID_QUERY', 'Invalid query parameters', parsed.error.flatten()));
    return;
  }
  const { repositoryId, page, pageSize } = parsed.data;

  try {
    const where = { userId: req.userId!, ...(repositoryId ? { repositoryId } : {}) };
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
    await subscriber.subscribe(deploymentLogChannel(deployment.id));
    subscriber.on('message', (_channel: string, message: string) =>
      res.write(`data: ${message}\n\n`),
    );

    req.on('close', () => {
      void subscriber.unsubscribe();
      subscriber.disconnect();
    });
  } catch (err) {
    next(err);
  }
});
