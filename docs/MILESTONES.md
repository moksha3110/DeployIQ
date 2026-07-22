# Milestones

Each milestone is independently demoable and ends with a commit. We do not
start milestone N+1 until you've confirmed N. Order is chosen so that every
milestone produces something runnable, not just a layer that only makes
sense once everything else exists.

- **M0 — Scaffolding**: monorepo (npm workspaces), TS/ESLint/Prettier config,
  `docker-compose.yml` (Postgres, Redis), Prisma init from `schema.prisma`,
  base Express app + React app that boot and talk to each other (`/health`),
  CI skeleton (lint + typecheck on push).
- **M1 — Auth**: GitHub OAuth app, full authorize→callback→session flow,
  JWT httpOnly cookie, `/auth/me`, protected route middleware, frontend
  login page + dashboard shell + logout.
- **M2 — GitHub Integration**: list repos (search, pagination), list
  branches, repo detail page in the frontend.
- **M3 — Build Engine**: BullMQ wired to Redis, `POST /deployments` →
  `Deployment` row → build job; worker clones at a commit SHA, detects
  project type (Node/Python/Go/static/Dockerfile-present), generates a
  Dockerfile when absent, runs `docker build`, pushes to Docker Hub, streams
  logs over SSE to a live log viewer in the frontend.
- **M4 — Kubernetes Deploy**: manifest generation module (unit-tested against
  fixtures), apply to Minikube, rollout watch, public URL surfaced in the
  dashboard, deployment status card (PENDING→...→RUNNING/FAILED).
- **M5 — Monitoring**: Prometheus + Grafana in `docker-compose`/Minikube,
  Monitoring Service PromQL queries, dashboard shows pod count, replica
  status, CPU/mem, restart count, with live polling.
- **M6 — AI Deployment Assistant**: failure hook on BUILD_FAILED/DEPLOY_FAILED,
  log/event collection, structured LLM prompt + typed response parsing,
  diagnosis card in the UI (root cause, fixes, confidence).
- **M7 — Auto-Redeploy**: webhook registration/verification, push→redeploy
  pipeline, deployment history list, rollback.
- **M8 — Security Hardening**: encrypt tokens/secrets at rest, K8s Secret
  handling review, basic image scan (Trivy) and dependency scan (`npm audit`
  or OSV) surfaced as warnings, rate limiting, input validation audit.
- **M9 — Testing**: unit coverage on manifest generation, project-type
  detection, container-port detection, webhook signature verification, and
  crypto round-tripping; Playwright e2e for the dashboard/deploy/rollback
  and failure→AI-diagnosis flows; both wired as required CI jobs. Built with
  **Vitest**, not Jest as originally planned — the whole stack was already
  on it since Milestone 0 (native ESM/TS, no separate ts-jest config), and
  introducing a second test runner for one milestone would've been pure
  overhead for no real gain. Playwright specs mock every backend response
  rather than hitting a real one; see `apps/frontend/e2e/README.md` for why
  (real GitHub OAuth can't be automated without checking in credentials —
  every real-infrastructure path here was instead verified manually against
  live GitHub/Docker/Minikube/Prometheus during development).
- **M10 — Polish**: Loki log shipping (server + worker), root `README.md`
  polish, consolidated from-zero setup guide. The `winston-loki` npm package
  turned out to be broken in this environment — its JSON batch encoder
  violates Loki's own push API schema (root-caused by reading its source,
  not just observing failures), reproducible on essentially any log with
  metadata. Replaced with a small hand-written transport
  (`common/loki-transport.ts`) that talks to Loki's push API directly —
  confirmed with a raw `curl` POST first to nail the correct payload shape,
  then verified end-to-end with real log lines queryable in Loki from both
  the API server and the worker process. No screenshots/GIF: this session's
  browser-automation screenshot tool was unreliable throughout (documented
  in-session, not hidden) — the live verification evidence lives in the
  commit history and `docs/` instead.

Stretch (only if time allows, after M10): Helm chart to run the platform
itself on Kubernetes; multi-registry support (ECR/GCR) via the
`ImageRegistry` interface; per-repo `platform.yaml` for custom build/probe
config.

## Format for each milestone

When we do a milestone, you get, in order:

1. **Explanation** — what we're building and why it's scoped this way.
2. **Architecture decisions** — anything milestone-specific not already in
   `ARCHITECTURE.md`.
3. **Folder structure** — new files/dirs this milestone adds.
4. **Code** — complete, not stubbed.
5. **Testing strategy** — what's covered and how to run it.
6. **Improvements** — what I'd do differently with more time.
7. **Interview questions** — the ones this milestone's code invites.
8. **Common mistakes** — what people get wrong here, and why the code avoids them.
9. **Scaling considerations** — what breaks first at 10x/100x load, and the fix.
