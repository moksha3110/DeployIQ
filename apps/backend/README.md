# Backend

Express + TypeScript. Two entrypoints sharing one codebase:

- `src/server.ts` — the API Gateway (HTTP/SSE), Auth, GitHub Integration,
  Deployment, Monitoring, and AI Analysis services.
- `src/worker.ts` — the BullMQ consumer process (Build Service + Kubernetes
  Service). Runs as a separate container/process from the API so build/deploy
  work never blocks request handling.

Modules (added starting Milestone 0):

```
src/
  modules/
    auth/
    github/
    deployments/
    build/
    kubernetes/
    ai/
    monitoring/
  common/        middleware, error types, logger, config
  queues/        BullMQ queue + job definitions
  prisma/        generated client wiring
```

Scaffolded in Milestone 0. See [../../docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
and [../../docs/API.md](../../docs/API.md).
