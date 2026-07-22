import { env } from '../../config/env.js';

// read:user + user:email for the profile, repo for Milestones 2/7 (listing
// repos and registering webhooks). Requesting it now avoids forcing a
// re-authorization prompt on every user later when that milestone lands.
const OAUTH_SCOPES = 'read:user user:email repo';

export function buildAuthorizeUrl(state: string): string {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', callbackUrl());
  url.searchParams.set('scope', OAUTH_SCOPES);
  url.searchParams.set('state', state);
  return url.toString();
}

export function callbackUrl(): string {
  return `${env.BACKEND_URL}/api/auth/github/callback`;
}

interface GithubTokenResponse {
  access_token: string;
  scope: string;
  token_type: string;
}

interface GithubTokenErrorResponse {
  error: string;
  error_description?: string;
}

export class GithubOAuthError extends Error {}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(),
    }),
  });

  const body = (await res.json()) as GithubTokenResponse | GithubTokenErrorResponse;
  if (!res.ok || 'error' in body) {
    const message = 'error' in body ? (body.error_description ?? body.error) : res.statusText;
    throw new GithubOAuthError(`GitHub token exchange failed: ${message}`);
  }
  return body.access_token;
}

export interface GithubUser {
  githubId: string;
  username: string;
  avatarUrl: string | null;
  email: string | null;
}

interface GithubUserResponse {
  id: number;
  login: string;
  avatar_url: string | null;
  email: string | null;
}

interface GithubEmailResponse {
  email: string;
  primary: boolean;
  verified: boolean;
}

export async function fetchGithubUser(accessToken: string): Promise<GithubUser> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'deployiq-platform',
  };

  const userRes = await fetch('https://api.github.com/user', { headers });
  if (!userRes.ok) {
    throw new GithubOAuthError(`GitHub user lookup failed: ${userRes.statusText}`);
  }
  const user = (await userRes.json()) as GithubUserResponse;

  // The /user endpoint omits `email` when the user has no public email set,
  // even with user:email scope granted — the verified primary address is
  // only reliably available from /user/emails.
  let email = user.email;
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', { headers });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as GithubEmailResponse[];
      email = emails.find((e) => e.primary && e.verified)?.email ?? null;
    }
  }

  return {
    githubId: String(user.id),
    username: user.login,
    avatarUrl: user.avatar_url,
    email,
  };
}
