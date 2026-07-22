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
- [Security posture](docs/SECURITY.md) — secrets, auth, injection, rate limiting, scanning, explicit gaps
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

### Deploying to Kubernetes (Milestone 4+)

Requires Minikube and `kubectl`.

```bash
minikube start --driver=docker
```

The backend then talks to whatever cluster your kubeconfig points at — no
separate config needed, same code path as a real cluster.

### Monitoring stack (Milestone 5+)

Requires Helm.

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  -f infra/prometheus/values.yaml --wait
```

The backend reaches Prometheus via its own managed `kubectl port-forward`
(see `modules/monitoring/prometheus-client.ts`) — nothing else to configure.
To view Grafana yourself:

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80
# admin / $(kubectl get secret -n monitoring kube-prometheus-stack-grafana \
#   -o jsonpath="{.data.admin-password}" | base64 -d)
```
