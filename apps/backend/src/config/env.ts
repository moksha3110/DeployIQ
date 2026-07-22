import 'dotenv/config';
import { z } from 'zod';

// Fail fast at boot if config is missing/malformed, rather than surfacing a
// confusing error deep in a request handler later.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  BACKEND_URL: z.string().url().default('http://localhost:4000'),

  GITHUB_CLIENT_ID: z.string().min(1, 'GITHUB_CLIENT_ID is required'),
  GITHUB_CLIENT_SECRET: z.string().min(1, 'GITHUB_CLIENT_SECRET is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // AES-256-GCM key, 32 bytes hex-encoded (64 hex characters).
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'ENCRYPTION_KEY must be 64 hex characters'),

  // All three optional together: when unset, built images stay local-only
  // (tagged but never pushed) — enough to deploy onto Minikube's own Docker
  // daemon in Milestone 4. Set them once a registry is wired up.
  DOCKER_REGISTRY_USERNAME: z.string().optional(),
  DOCKER_REGISTRY_PASSWORD: z.string().optional(),
  DOCKER_REGISTRY: z.string().default('docker.io'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
