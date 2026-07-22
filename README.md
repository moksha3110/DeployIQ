# AI-Powered Kubernetes Deployment Platform

A self-hosted deployment platform (Render/Railway/Heroku-style) built from
scratch: GitHub OAuth login, one-click deploy of any repo onto a real
Kubernetes cluster, live build/deploy logs, health + resource monitoring,
automatic redeploy on push, and an AI assistant that diagnoses failed
deployments from logs and pod events.

Built as a portfolio project to demonstrate distributed systems, container
orchestration, and applied AI engineering — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for the full design rationale.

## Status

In active development, built milestone by milestone. See
[`docs/MILESTONES.md`](docs/MILESTONES.md) for the roadmap and current
progress.

## Docs

- [Architecture](docs/ARCHITECTURE.md) — components, tech choices, diagrams, data flow
- [API design](docs/API.md) — REST endpoints
- [Kubernetes design](docs/KUBERNETES.md) — generated manifests, namespacing, rollout verification
- [Milestones](docs/MILESTONES.md) — build order and current status

## Structure

```
apps/
  frontend/      React + TS + Tailwind SPA
  backend/       Express + TS API server, BullMQ worker, Prisma schema
packages/
  shared-types/  DTOs shared between frontend and backend
infra/
  docker/        Dockerfiles, docker-compose for local dev
  k8s/            Platform-level manifests (stretch: run the platform on k8s itself)
  prometheus/ grafana/ loki/   Observability stack config
docs/            Architecture, API, and milestone docs
```

## Local development

Requires Node 22+ and Docker Desktop.

```bash
npm install

# Postgres + Redis
docker compose -f infra/docker/docker-compose.yml up -d

# Copy env files and fill in secrets as milestones require them
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env

# Apply the schema
npm run prisma:migrate --workspace apps/backend

# Terminal 1
npm run dev:backend
# Terminal 2
npm run dev:frontend
```

Backend on `http://localhost:4000`, frontend on `http://localhost:5173`. The
dashboard's scaffolding check should show `backend ok`.

`npm run lint` / `npm run typecheck` / `npm run build` run across all
workspaces and are what CI checks on every push.
