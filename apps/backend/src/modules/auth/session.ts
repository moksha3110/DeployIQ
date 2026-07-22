import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export const SESSION_COOKIE_NAME = 'session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

interface SessionPayload {
  sub: string; // User.id
}

export function issueSession(res: Response, userId: string): void {
  const token = jwt.sign({ sub: userId } satisfies SessionPayload, env.JWT_SECRET, {
    expiresIn: SESSION_TTL_SECONDS,
  });

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}

// Returns the authenticated user id, or null if there's no session /
// the token is invalid or expired. Never throws — callers decide what a
// missing session means for their route.
export function readSession(req: Request): string | null {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) return null;

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as SessionPayload;
    return payload.sub;
  } catch {
    return null;
  }
}
