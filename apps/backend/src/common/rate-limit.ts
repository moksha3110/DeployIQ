import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// A generous ceiling on every /api route — this exists to blunt outright
// abuse/scripting, not to shape normal usage. React Query's polling
// (deployment status every 2s, metrics every 10s) must comfortably fit
// under it for one active user.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

// OAuth endpoints are unauthenticated by definition (that's the point) —
// the usual per-user throttling doesn't apply, so they get their own tight
// limit keyed on IP to slow down credential-stuffing/authorize-spam.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Deploys are the expensive operation in this system (a real `docker
// build` + cluster rollout) — keyed per-user, not per-IP, since the whole
// point is stopping one account from queuing unbounded builds, not
// penalizing everyone behind a shared NAT.
export const deployLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // req.userId is a stable, non-spoofable key (comes from the verified JWT
  // session, not client input); the IP fallback goes through express-rate-
  // limit's own helper so an IPv6 client can't dodge the limit by varying
  // the trailing bits of their address within the same /64.
  keyGenerator: (req) => req.userId ?? ipKeyGenerator(req.ip ?? 'unknown'),
});

// The webhook endpoint is unauthenticated (GitHub can't hold a session)
// and signature-verified per request rather than per-connection — a tight
// limit here is cheap insurance against someone hammering it with garbage
// before the signature check even runs.
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
