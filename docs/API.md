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

| Method | Path                     | Description                                                                                                                             |
| ------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/repos`                 | List the user's GitHub repos (paginated, `?search=&page=`). Proxies + caches GitHub's API.                                              |
| GET    | `/repos/:id/branches`    | List branches for a repo.                                                                                                               |
| GET    | `/repos/:id/auto-deploy` | `{ enabled: boolean }` — whether a webhook is currently registered.                                                                     |
| POST   | `/repos/:id/auto-deploy` | Enable auto-deploy: registers a GitHub webhook, persists `webhookId`/encrypted `webhookSecret`. Tracks the repo's `defaultBranch` only. |
| DELETE | `/repos/:id/auto-deploy` | Disable auto-deploy: removes the webhook, clears the stored secret.                                                                     |

`GET`/`PUT /repos/:id/env` (env var management) aren't implemented — deployed apps get no env vars beyond what's baked into the image (see [KUBERNETES.md](./KUBERNETES.md)).

## Deployments

| Method | Path                        | Description                                                                                                                                                                               |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/deployments`              | Body: `{ repositoryId, branch }` (`repositoryId` is the GitHub repo id — see `RepositorySummary.id`). Creates a `Deployment`, enqueues a build job. `202` + `{ deploymentId }`.           |
| GET    | `/deployments`              | List deployments for the user (`?githubRepoId=&page=&pageSize=`) — deployment history for a repo.                                                                                         |
| GET    | `/deployments/:id`          | Full deployment detail: status, imageTag, publicUrl, latest AI analysis if any.                                                                                                           |
| GET    | `/deployments/:id/logs`     | **SSE** stream of build/deploy log lines, live during BUILDING/DEPLOYING, replays persisted lines first if reconnecting.                                                                  |
| POST   | `/deployments/:id/rollback` | Re-deploy a prior successful build's image under a _new_ `Deployment` row (`triggeredBy=ROLLBACK`) — skips clone/build, goes straight to the deploy queue since the image already exists. |
| GET    | `/deployments/:id/analysis` | Latest `AIAnalysis` for a failed deployment (`404` if none / not failed).                                                                                                                 |

No separate `/redeploy` endpoint — re-`POST /deployments` with the same repo/branch does that (fetches the branch's current HEAD, which is exactly what "redeploy" means for a moving branch). `DELETE /deployments/:id` (namespace teardown) isn't implemented yet — deployments accumulate namespaces until manually cleaned up; a real gap, not hidden.

## Monitoring

| Method | Path                                                 | Description                                                                                         |
| ------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| GET    | `/deployments/:id/metrics`                           | Current snapshot: pod count, replica status, CPU/mem usage, restart count (PromQL instant queries). |
| GET    | `/deployments/:id/metrics/history?range=1h\|24h\|7d` | Time-series for charts (PromQL range queries).                                                      |

## Webhooks

| Method | Path               | Description                                                                                                                                                                        |
| ------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/webhooks/github` | Public (no session). Verifies `X-Hub-Signature-256` against the repo's stored `webhookSecret`. On `push` to the tracked branch, creates a `Deployment` with `triggeredBy=WEBHOOK`. |

**`PUBLIC_WEBHOOK_URL` must be a real public URL for `POST /repos/:id/auto-deploy` to work at all** — confirmed against GitHub's real API, not assumed: with it left at the `localhost` default, GitHub's webhook-creation endpoint rejects the request outright (`422`, `"url is not supported because it isn't reachable over the public Internet (localhost)"`) before a webhook is ever created. Local dev needs a tunnel (ngrok, localtunnel, Cloudflare Tunnel) pointed at the backend, with `PUBLIC_WEBHOOK_URL` set to that tunnel's URL. The delivery-handling logic itself (`POST /webhooks/github` — signature verification, push parsing, dedup) has no such dependency and is fully testable locally by POSTing a correctly-signed payload directly, which is how it was verified here.

## Conventions

- **Validation**: every request body/query validated with `zod` at the route boundary; failures return `400` with field-level `details`.
- **Pagination**: cursor or `page`/`pageSize`, capped `pageSize` (max 50).
- **Idempotency**: `POST /deployments` is not idempotent by design (each call = new deployment); webhook handler dedupes on `(repositoryId, commitSha)` to survive GitHub's at-least-once delivery.
- **Long-running work never blocks a request** — anything that touches Docker or Kubernetes happens in a worker; HTTP handlers only read/write Postgres and enqueue jobs.
