# Security Posture

What this platform actually does for security, what it deliberately doesn't,
and why. Written the way a real security review would be — claims backed by
what was verified, gaps named rather than implied away.

## Secrets at rest

Encrypted with AES-256-GCM (`common/crypto.ts`), never returned by any API
response:

- GitHub OAuth access tokens (`User.accessTokenEncrypted`)
- GitHub webhook secrets (`Repository.webhookSecret`)

Plaintext env vars (`JWT_SECRET`, `ENCRYPTION_KEY`, `GITHUB_CLIENT_SECRET`,
`ANTHROPIC_API_KEY`, `DOCKER_REGISTRY_PASSWORD`) live only in `.env`
(gitignored) and process memory — never logged, never included in an error
response.

## Sessions & authentication

httpOnly, `SameSite=Lax` JWT cookie (`modules/auth/session.ts`); `secure`
flag on in production. OAuth flow is CSRF-protected via a random `state`
value round-tripped through its own short-lived httpOnly cookie
(`modules/auth/router.ts`) — verified with a timing-safe-irrelevant equality
check since `state` isn't secret, just unguessable per-flow.

## Webhook signature verification

`modules/webhooks/router.ts` verifies `X-Hub-Signature-256` via HMAC-SHA256
over the **raw** request body (not the re-serialized parsed JSON, which can
differ byte-for-byte from what GitHub actually signed) using
`crypto.timingSafeEqual` — a non-constant-time comparison here would leak
the correct signature one byte at a time to a patient attacker.

**Found and fixed during this milestone, not before deployment**: the shape
of the request body was accessed (`payload.repository.id`) before it was
validated, and before the signature check even ran — meaning it ran against
fully unauthenticated input. A single `POST` with `{}` as the body crashed
the entire backend process (verified live: sent it, backend went from
`200 OK` on `/health` to connection-refused). Fixed with a `zod` schema
validating the payload shape before anything touches it, and the whole
handler wrapped in `try/catch` as defense-in-depth so no future change to
this file can reintroduce an unhandled-crash path here.

## Injection

- **SQL**: none possible by construction — every query goes through Prisma's
  parameterized query builder; `$queryRaw`/`$executeRaw` are never used
  anywhere in the codebase (verified by grep, not assumed).
- **Command**: every subprocess call (`git clone`, `docker build`,
  `kubectl`, `minikube`, Trivy) uses `child_process.spawn` with an argv
  array, never `exec`/`execSync` with a shell-interpreted string — so a
  malicious branch name, repo name, or commit SHA can't break out into
  shell metacharacters no matter what an attacker puts in a repo they
  control.
- **XSS**: React escapes all rendered content by default;
  `dangerouslySetInnerHTML` is never used anywhere in the frontend
  (verified by grep).

## Authorization

Every deployment/repo-scoped query filters by `userId` from the verified
session — not just by the resource's own ID. **Found and fixed during this
milestone**: `GET`/`DELETE /repos/:id/auto-deploy` looked up the repo by
`githubRepoId` alone, letting any authenticated user probe (or, for DELETE,
attempt to touch) another user's repo's auto-deploy state just by guessing
the numeric GitHub repo ID. Low severity — it leaks a boolean, and the
actual GitHub-side webhook deletion is independently gated by the caller's
own GitHub token permissions — but a real gap, fixed by scoping both to
`userId` like every other resource lookup already was.

## Rate limiting (`common/rate-limit.ts`)

| Limiter          | Scope                                                 | Window | Limit | Why                                                                                                                                                                                                                              |
| ---------------- | ----------------------------------------------------- | ------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiLimiter`     | all `/api/*`                                          | 15 min | 600   | Blunt-force ceiling against scripted abuse; generous enough that normal polling (deployment status every 2s, metrics every 10s) never gets near it.                                                                              |
| `authLimiter`    | `/auth/github`, `/auth/github/callback`               | 15 min | 20    | Unauthenticated by definition — no per-user key available, so it's IP-keyed.                                                                                                                                                     |
| `deployLimiter`  | `POST /deployments`, `POST /deployments/:id/rollback` | 1 hour | 20    | The genuinely expensive operations (a real `docker build` + cluster rollout) — keyed per-user (`req.userId`), not per-IP, so it stops one account from queuing unbounded builds without penalizing everyone behind a shared NAT. |
| `webhookLimiter` | `POST /webhooks/github`                               | 1 min  | 30    | Cheap insurance against flooding before signature verification even runs.                                                                                                                                                        |

**Found and fixed during this milestone**: `deployLimiter`'s IP fallback
(`req.userId ?? req.ip`) failed `express-rate-limit`'s own startup
validation — a raw IP key doesn't normalize IPv6 addresses, so a client
could dodge the limit by varying the trailing bits of their address within
the same /64. Fixed using the library's own `ipKeyGenerator` helper for the
fallback case.

## Image & dependency scanning

- **Container images**: every successful build is scanned with
  [Trivy](https://github.com/aquasecurity/trivy) (`modules/build/scan.ts`,
  run via its official Docker image — no local install required),
  HIGH/CRITICAL findings logged as `WARN`-level build log lines visible in
  the UI. **Informational only, not a gate** — a real platform would let you
  configure a policy (block on CRITICAL, allow-list known-accepted CVEs);
  that's a named gap, not an oversight, given the project's scope.
- **This platform's own dependencies**: `npm audit --audit-level=high` runs
  in CI (informational — `|| true`, doesn't fail the build). Current known
  findings, deliberately not force-fixed: a chain of `critical`/`moderate`
  vulnerabilities in `@kubernetes/client-node@0.22.x`'s legacy `request`
  dependency (`form-data`, `qs`, `tough-cookie`, `uuid`) — the fix is only
  in `@kubernetes/client-node@1.x`, a breaking API rewrite that every
  Kubernetes Service module (Milestones 4, 5, 7) would need re-verifying
  against. Deferred as a deliberate call, not silently ignored: an
  unplanned major dependency migration late in a long build session risks
  breaking several already-verified milestones for a dependency whose
  vulnerable code path (`request`) isn't reachable by anything this
  platform actually does with it (webhook creation, manifest apply — no
  multipart form uploads, no cookie jars). Also present: a moderate
  `esbuild`/`vite` dev-server-only advisory, not applicable to anything this
  platform serves in production.

## Explicitly out of scope (named, not hidden)

- **Multi-tenant kernel isolation**: deployed apps run as regular pods with
  resource requests/limits, not gVisor/Kata/NetworkPolicy-enforced
  isolation — see [KUBERNETES.md](./KUBERNETES.md#isolation-notes-explicitly-out-of-scope-for-mvp-called-out-for-interviews).
- **Per-repo env var secrets**: `PUT /repos/:id/env` isn't implemented, so
  there's no user-supplied-secret attack surface yet (nothing to leak).
- **CSP / security headers** (`helmet` or equivalent): not added — the API
  serves JSON to a single known frontend origin (CORS-restricted), not
  HTML to arbitrary browsers, which is what most of `helmet`'s headers
  defend against.
