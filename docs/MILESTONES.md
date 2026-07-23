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

- **M11 — AI Infra Intelligence**: ten sub-milestones (M11.1-M11.10), each
  independently demoable and committed/pushed on its own, all verified
  against the real Minikube cluster (never mocked):
  - **M11.1 — Live health score**: a K8s read-back layer
    (`modules/kubernetes/inspect.ts`) reading Deployment spec/pod status
    back from the cluster (the deploy pipeline only ever wrote these
    before), plus a 0-100 health-score engine (availability, crash/OOM
    reasons, restarts, resource pressure vs limits, probe/HPA hygiene)
    with a factor-by-factor breakdown, not just a number. A repeatable
    BullMQ job snapshots every RUNNING deployment's score every 5 minutes
    into a new `DeploymentSnapshot` table, independent of Prometheus's own
    retention, to back the trend view added in M11.6.
  - **M11.2 — AI recommendations**: compares live spec vs actual Prometheus
    usage and prescribes concrete fixes (right-sizing, missing PDBs,
    instability) via a forced-tool-use Claude call, mirroring the M6 AI
    Diagnosis pattern but computed fresh per request (advisory, not
    event-triggered) with a manual Refresh rather than polling.
  - **M11.3 — Security scoring**: scans live spec + Service/NetworkPolicy
    state for root containers, privileged mode, unpinned images, missing
    NetworkPolicy, etc. — 0-100 score plus an A-F grade, deliberately a
    different scale from the health score so the two cards read as
    answering different questions at a glance.
  - **M11.4 — Incident detection**: classifies pod status
    (CrashLoopBackOff/ImagePullBackOff/OOMKilled/unschedulable) and
    namespace events into a typed `Incident`, with an AI root cause +
    priority (deterministic fallback when no API key configured, so
    detection itself never depends on AI). Runs on the M11.1 snapshot
    cadence and synchronously on page view; incidents auto-resolve when
    the triggering condition clears.
  - **M11.5 — Cost analyzer**: estimates monthly cost from live resource
    requests × replicas against a documented blended on-demand rate (no
    cloud billing API connected — the same "default pricing" approach
    Kubecost uses), plus a right-sized-to-actual-usage comparison.
  - **M11.6 — Resource analytics**: a per-deployment Recharts dashboard
    with a 1h/24h/7d/30d range selector — CPU/memory from Prometheus range
    queries, health-score trend from the M11.1 snapshot table.
  - **M11.7 — Infra topology graph**: `GET /:id/topology` enumerates the
    live chain from GitHub repo through cluster/namespace/Deployment/pods/
    Service/Ingress/ConfigMaps/Secrets with real status per node; rendered
    with React Flow (`@xyflow/react`) using a small hand-rolled
    BFS-depth-by-column layout instead of a full auto-layout library.
  - **M11.8 — Natural-language query**: a general agentic tool-use loop
    (`tool_choice: "auto"`, capped at 4 turns) letting the model call
    whichever of 5 tools (health/security/cost/incidents/topology) a
    free-form question needs, each tool a thin wrapper over the same
    functions the REST endpoints use — an answer is never a separate,
    unverified code path from what the dashboard itself shows.
  - **M11.9 — PDF reports**: `GET /:id/report.pdf` streams a
    PDFKit-generated report (health/security/cost/incidents/
    recommendations) straight to the response; every section gathered
    independently so one unavailable source never blocks the rest.
  - **M11.10 — Dashboard overhaul**: shadcn/ui foundation (Radix + CVA +
    Tailwind CSS-variable theme, hand-written per shadcn's own generated
    source rather than fighting the CLI non-interactively) — `Button`,
    `Card`, `Badge`, `Tabs`, `Separator`. A new `AppShell` gives every
    protected page a persistent top bar (previously only Dashboard had a
    logout button); `DeploymentDetail` reorganized from one long vertical
    stack of cards into tabs (Health/Cost/Incidents/Recommendations/Ask
    AI). Mid-milestone, CI's `format:check` step turned out to have been
    failing since M11.4 (new files were never run through Prettier
    locally before committing) — caught via the GitHub Actions API, fixed,
    and confirmed green before continuing.

  What I'd do differently with more time: code-split the frontend bundle
  (842 kB post-M11.10, mostly React Flow + Recharts + Radix — a single
  entry point was fine through M10 but isn't anymore); extend the shadcn
  restyle to `RepoDetail`/`DeploymentAnalytics`/`DeploymentTopology`
  (currently just Dashboard + DeploymentDetail got the full pass);
  multi-turn conversation memory for M11.8 instead of stateless
  per-question.

Stretch (only if time allows, after M11): Helm chart to run the platform
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
