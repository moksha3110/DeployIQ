import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { BranchSummary, PaginatedResult, RepositorySummary } from '@platform/shared-types';
import { decrypt, encrypt } from '../../common/crypto.js';
import { env } from '../../config/env.js';
import { HttpError } from '../../common/errors.js';
import { prisma } from '../../prisma/client.js';
import { requireAuth } from '../auth/middleware.js';
import {
  createWebhook,
  deleteWebhook,
  fetchAllRepositories,
  fetchBranches,
  fetchRepository,
  GithubApiError,
} from './client.js';

export const githubRouter = Router();
githubRouter.use(requireAuth);

async function getAccessToken(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return decrypt(user.accessTokenEncrypted);
}

function mapGithubError(err: unknown): unknown {
  if (err instanceof GithubApiError && (err.status === 401 || err.status === 403)) {
    return new HttpError(
      409,
      'GITHUB_TOKEN_INVALID',
      'GitHub access was revoked or expired — please sign out and sign in again.',
    );
  }
  // Any other GitHub rejection (e.g. 422 "url is not supported... isn't
  // reachable over the public Internet (localhost)" when PUBLIC_WEBHOOK_URL
  // still points at localhost) — surface GitHub's own message rather than
  // falling through to a generic 500.
  if (err instanceof GithubApiError) {
    return new HttpError(502, 'GITHUB_REQUEST_FAILED', err.message);
  }
  return err;
}

const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

githubRouter.get('/', async (req, res, next) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    next(new HttpError(400, 'INVALID_QUERY', 'Invalid query parameters', parsed.error.flatten()));
    return;
  }
  const { search, page, pageSize } = parsed.data;

  try {
    const accessToken = await getAccessToken(req.userId!);
    const all = await fetchAllRepositories(accessToken);

    const filtered = search
      ? all.filter((repo) => repo.fullName.toLowerCase().includes(search.toLowerCase()))
      : all;

    const start = (page - 1) * pageSize;
    const body: PaginatedResult<RepositorySummary> = {
      items: filtered.slice(start, start + pageSize),
      page,
      pageSize,
      total: filtered.length,
    };
    res.json(body);
  } catch (err) {
    next(mapGithubError(err));
  }
});

githubRouter.get('/:id', async (req, res, next) => {
  try {
    const accessToken = await getAccessToken(req.userId!);
    const repo: RepositorySummary = await fetchRepository(accessToken, req.params.id!);
    res.json(repo);
  } catch (err) {
    next(mapGithubError(err));
  }
});

githubRouter.get('/:id/branches', async (req, res, next) => {
  try {
    const accessToken = await getAccessToken(req.userId!);
    const branches: BranchSummary[] = await fetchBranches(accessToken, req.params.id!);
    res.json(branches);
  } catch (err) {
    next(mapGithubError(err));
  }
});

// Upserts our Repository row from live GitHub data — same lazy-persist
// pattern as createDeploymentForUser, since enabling auto-deploy is another
// place a repo can go from "just something in the GitHub list" to
// "something we track."
async function upsertRepository(userId: string, accessToken: string, githubRepoId: string) {
  const githubRepo = await fetchRepository(accessToken, githubRepoId);
  return prisma.repository.upsert({
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
}

githubRouter.get('/:id/auto-deploy', async (req, res, next) => {
  try {
    // Scoped by userId, not just githubRepoId — otherwise any authenticated
    // user could probe whether auto-deploy is enabled on an arbitrary repo
    // (including ones they have no GitHub access to) just by guessing IDs.
    const repository = await prisma.repository.findFirst({
      where: { githubRepoId: req.params.id!, userId: req.userId! },
    });
    res.json({ enabled: !!repository?.webhookId });
  } catch (err) {
    next(err);
  }
});

githubRouter.post('/:id/auto-deploy', async (req, res, next) => {
  try {
    const accessToken = await getAccessToken(req.userId!);
    const repository = await upsertRepository(req.userId!, accessToken, req.params.id!);

    if (repository.webhookId) {
      res.json({ enabled: true });
      return;
    }

    const secret = randomBytes(32).toString('hex');
    const webhookId = await createWebhook(
      accessToken,
      repository.fullName,
      `${env.PUBLIC_WEBHOOK_URL}/api/webhooks/github`,
      secret,
    );

    await prisma.repository.update({
      where: { id: repository.id },
      data: { webhookId, webhookSecret: encrypt(secret) },
    });

    res.json({ enabled: true });
  } catch (err) {
    next(mapGithubError(err));
  }
});

githubRouter.delete('/:id/auto-deploy', async (req, res, next) => {
  try {
    const repository = await prisma.repository.findFirst({
      where: { githubRepoId: req.params.id!, userId: req.userId! },
    });
    if (!repository?.webhookId) {
      res.json({ enabled: false });
      return;
    }

    const accessToken = await getAccessToken(req.userId!);
    await deleteWebhook(accessToken, repository.fullName, repository.webhookId);
    await prisma.repository.update({
      where: { id: repository.id },
      data: { webhookId: null, webhookSecret: null },
    });

    res.json({ enabled: false });
  } catch (err) {
    next(mapGithubError(err));
  }
});
