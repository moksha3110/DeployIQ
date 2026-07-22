import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorBody } from '@platform/shared-types';
import { logger } from './logger.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function notFoundHandler(req: Request, res: Response) {
  const body: ApiErrorBody = {
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  };
  res.status(404).json(body);
}

// Express identifies error-handling middleware by arity (4 args) — the
// unused `next` is required, not dead code.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  if (err instanceof HttpError) {
    const body: ApiErrorBody = {
      error: { code: err.code, message: err.message, details: err.details },
    };
    res.status(err.status).json(body);
    return;
  }

  logger.error('Unhandled error', { err });
  const body: ApiErrorBody = {
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  };
  res.status(500).json(body);
}
