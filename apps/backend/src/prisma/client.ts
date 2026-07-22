import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

// Singleton so `tsx watch`'s module reloads (and, in prod, any accidental
// double-import) don't open a new connection pool each time.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV === 'development') {
  globalThis.__prisma = prisma;
}
