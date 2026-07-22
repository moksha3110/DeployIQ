# REST API Design

Base path: `/api`. All authenticated routes require a valid session (httpOnly
JWT cookie set by the OAuth callback). Responses are JSON; errors follow
`{ error: { code, message, details? } }` with the matching HTTP status.

## Auth

| Method | Path                    | Description                                                                           |
| ------ | ----------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/auth/github`          | Redirect to GitHub's OAuth authorize URL (state param = CSRF token).                  |
| GET    | `/auth/github/callback` | Exchange `code` for a token, upsert `User`, set session cookie, redirect to frontend. |
| POST   | `/auth/logout`          | Clear session cookie.                                                                 |
| GET    | `/auth/me`              | Current user profile. `401` if not authenticated.                                     |

## Repositories

| Method | Path                     | Description                                                                                |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------ |
| GET    | `/repos`                 | List the user's GitHub repos (paginated, `?search=&page=`). Proxies + caches GitHub's API. |
| GET    | `/repos/:id/branches`    | List branches for a repo.                                                                  |
| POST   | `/repos/:id/auto-deploy` | Enable auto-deploy: registers a GitHub webhook, persists `webhookId`/`webhookSecret`.      |
| DELETE | `/repos/:id/auto-deploy` | Disable auto-deploy: removes the webhook.                                                  |
| GET    | `/repos/:id/env`         | List env vars for a repo (values redacted if `isSecret`).                                  |
| PUT    | `/repos/:id/env`         | Replace env vars (upsert set), encrypted at rest.                                          |

## Deployments

| Method | Path                        | Description                                                                                                                            |
| ------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/deployments`              | Body: `{ repositoryId, branch }`. Creates a `Deployment` (status `PENDING`), enqueues a build job. Returns `202` + `{ deploymentId }`. |
| GET    | `/deployments`              | List deployments for the user (`?repositoryId=&status=&page=`).                                                                        |
| GET    | `/deployments/:id`          | Full deployment detail: status, imageTag, publicUrl, latest AI analysis if any.                                                        |
| GET    | `/deployments/:id/logs`     | **SSE** stream of build/deploy log lines, live during BUILDING/DEPLOYING, replays persisted lines first if reconnecting.               |
| POST   | `/deployments/:id/redeploy` | Re-run the pipeline for the same commit (or `{ branch }` to redeploy latest of a branch).                                              |
| POST   | `/deployments/:id/rollback` | Roll the repo's live deployment back to this (previously RUNNING) deployment's image.                                                  |
| DELETE | `/deployments/:id`          | Tear down the K8s namespace and mark `STOPPED`.                                                                                        |
| GET    | `/deployments/:id/analysis` | Latest `AIAnalysis` for a failed deployment (`404` if none / not failed).                                                              |

## Monitoring

| Method | Path                                                 | Description                                                                                         |
| ------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| GET    | `/deployments/:id/metrics`                           | Current snapshot: pod count, replica status, CPU/mem usage, restart count (PromQL instant queries). |
| GET    | `/deployments/:id/metrics/history?range=1h\|24h\|7d` | Time-series for charts (PromQL range queries).                                                      |

## Webhooks

| Method | Path               | Description                                                                                                                                                                        |
| ------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/webhooks/github` | Public (no session). Verifies `X-Hub-Signature-256` against the repo's stored `webhookSecret`. On `push` to the tracked branch, creates a `Deployment` with `triggeredBy=WEBHOOK`. |

## Conventions

- **Validation**: every request body/query validated with `zod` at the route boundary; failures return `400` with field-level `details`.
- **Pagination**: cursor or `page`/`pageSize`, capped `pageSize` (max 50).
- **Idempotency**: `POST /deployments` is not idempotent by design (each call = new deployment); webhook handler dedupes on `(repositoryId, commitSha)` to survive GitHub's at-least-once delivery.
- **Long-running work never blocks a request** — anything that touches Docker or Kubernetes happens in a worker; HTTP handlers only read/write Postgres and enqueue jobs.
