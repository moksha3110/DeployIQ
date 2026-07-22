import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../common/errors.js';
import { readSession } from './session.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const userId = readSession(req);
  if (!userId) {
    next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in required'));
    return;
  }
  req.userId = userId;
  next();
}
