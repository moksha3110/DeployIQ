import { Router } from 'express';
import { z } from 'zod';
import type { BranchSummary, PaginatedResult, RepositorySummary } from '@platform/shared-types';
import { decrypt } from '../../common/crypto.js';
import { HttpError } from '../../common/errors.js';
import { prisma } from '../../prisma/client.js';
import { requireAuth } from '../auth/middleware.js';
import { fetchAllRepositories, fetchBranches, fetchRepository, GithubApiError } from './client.js';

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
