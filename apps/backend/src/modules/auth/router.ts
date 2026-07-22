import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { UserProfile } from '@platform/shared-types';
import { env } from '../../config/env.js';
import { encrypt } from '../../common/crypto.js';
import { logger } from '../../common/logger.js';
import { authLimiter } from '../../common/rate-limit.js';
import { prisma } from '../../prisma/client.js';
import { buildAuthorizeUrl, exchangeCodeForToken, fetchGithubUser } from './github-oauth.js';
import { requireAuth } from './middleware.js';
import { clearSession, issueSession } from './session.js';

export const authRouter = Router();

const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

authRouter.get('/github', authLimiter, (_req, res) => {
  const state = randomBytes(16).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: OAUTH_STATE_TTL_MS,
    path: '/',
  });
  res.redirect(buildAuthorizeUrl(state));
});

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

authRouter.get('/github/callback', authLimiter, async (req, res) => {
  const expectedState = req.cookies?.[OAUTH_STATE_COOKIE];
  res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });

  const parsedQuery = callbackQuerySchema.safeParse(req.query);
  if (!parsedQuery.success || !expectedState || parsedQuery.data.state !== expectedState) {
    res.redirect(`${env.FRONTEND_ORIGIN}/login?error=state_mismatch`);
    return;
  }

  try {
    const accessToken = await exchangeCodeForToken(parsedQuery.data.code);
    const githubUser = await fetchGithubUser(accessToken);

    const user = await prisma.user.upsert({
      where: { githubId: githubUser.githubId },
      create: {
        githubId: githubUser.githubId,
        username: githubUser.username,
        avatarUrl: githubUser.avatarUrl,
        email: githubUser.email,
        accessTokenEncrypted: encrypt(accessToken),
      },
      update: {
        username: githubUser.username,
        avatarUrl: githubUser.avatarUrl,
        email: githubUser.email,
        accessTokenEncrypted: encrypt(accessToken),
      },
    });

    issueSession(res, user.id);
    res.redirect(env.FRONTEND_ORIGIN);
  } catch (err) {
    logger.error('GitHub OAuth callback failed', { err });
    res.redirect(`${env.FRONTEND_ORIGIN}/login?error=oauth_failed`);
  }
});

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    // requireAuth guarantees req.userId is set; narrow explicitly so
    // Prisma's exactOptionalPropertyTypes-strict input type is satisfied.
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      clearSession(res);
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } });
      return;
    }

    const profile: UserProfile = {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      email: user.email,
    };
    res.json(profile);
  } catch (err) {
    next(err);
  }
});
