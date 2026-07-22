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
  // Fixed forever by what's registered in the GitHub OAuth App's callback
  // URL — never point this at a tunnel.
  BACKEND_URL: z.string().url().default('http://localhost:4000'),
  // Where GitHub is told to POST push events. Separate from BACKEND_URL
  // because this one *does* need to change — to a tunnel URL — for GitHub's
  // servers to reach a machine that's normally just localhost.
  PUBLIC_WEBHOOK_URL: z.string().url().default('http://localhost:4000'),

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

  // Optional — without it, failed deployments just skip AI diagnosis (see
  // modules/ai/analyze.ts) instead of the whole pipeline erroring out.
  // Haiku by default: this only runs on actual failures, not every
  // request, but there's no reason to spend Sonnet-level cost on
  // extracting a root cause from a log excerpt.
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-haiku-4-5-20251001'),

  // Off by default — logs still go to the console either way (see
  // common/logger.ts). Requires the Loki stack from infra/loki/values.yaml
  // to actually be installed; harmless but pointless to enable otherwise.
  // z.coerce.boolean() is a trap here — Boolean("false") is true, since any
  // non-empty string is truthy.
  LOKI_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
