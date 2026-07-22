import type { BranchSummary, RepositorySummary } from '@platform/shared-types';

// Thrown when GitHub itself rejects the stored token (revoked access,
// expired) — distinct from a network/5xx error so callers can prompt
// re-auth instead of showing a generic failure.
export class GithubApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function headers(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'deployiq-platform',
  };
}

async function githubFetch(
  path: string,
  accessToken: string,
  init?: { method?: string; body?: unknown },
): Promise<Response> {
  const res = await fetch(`https://api.github.com${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      ...headers(accessToken),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  if (res.status === 401 || res.status === 403) {
    throw new GithubApiError(res.status, 'GitHub rejected the stored access token');
  }
  if (!res.ok) {
    // GitHub's error bodies (esp. 422 validation errors) carry the actual
    // useful detail one level deeper than `message` — a 422's top-level
    // message is just "Validation Failed"; the real reason (e.g. "url is
    // not supported because it isn't reachable over the public Internet
    // (localhost)") is in `errors[].message`. Skipping that turns a
    // diagnosable failure into "something went wrong."
    const body = (await res.json().catch(() => null)) as {
      message?: string;
      errors?: Array<{ message?: string }>;
    } | null;
    const nested = body?.errors
      ?.map((e) => e.message)
      .filter(Boolean)
      .join('; ');
    const detail = nested || body?.message || res.statusText;
    throw new GithubApiError(res.status, `GitHub API error: ${detail}`);
  }
  return res;
}

interface GithubRepoResponse {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  default_branch: string;
  private: boolean;
  html_url: string;
  updated_at: string;
}

function toRepositorySummary(repo: GithubRepoResponse): RepositorySummary {
  return {
    id: String(repo.id),
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    defaultBranch: repo.default_branch,
    isPrivate: repo.private,
    htmlUrl: repo.html_url,
    updatedAt: repo.updated_at,
  };
}

// GitHub caps per_page at 100 and paginating further requires walking the
// `Link` header — skipped for now since a portfolio demo account won't have
// hundreds of repos. Documented limitation, not a silent gap: revisit if
// this platform ever needs to support GitHub orgs with large repo counts.
export async function fetchAllRepositories(accessToken: string): Promise<RepositorySummary[]> {
  const res = await githubFetch(
    '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
    accessToken,
  );
  const repos = (await res.json()) as GithubRepoResponse[];
  return repos.map(toRepositorySummary);
}

export async function fetchRepository(
  accessToken: string,
  githubRepoId: string,
): Promise<RepositorySummary> {
  const res = await githubFetch(`/repositories/${githubRepoId}`, accessToken);
  const repo = (await res.json()) as GithubRepoResponse;
  return toRepositorySummary(repo);
}

interface GithubBranchResponse {
  name: string;
}

export async function fetchBranches(
  accessToken: string,
  githubRepoId: string,
): Promise<BranchSummary[]> {
  const repo = await fetchRepository(accessToken, githubRepoId);

  const branchesRes = await githubFetch(
    `/repos/${repo.fullName}/branches?per_page=100`,
    accessToken,
  );
  const branches = (await branchesRes.json()) as GithubBranchResponse[];

  return branches.map((b) => ({ name: b.name, isDefault: b.name === repo.defaultBranch }));
}

interface GithubBranchDetailResponse {
  commit: { sha: string };
}

export async function fetchBranchCommitSha(
  accessToken: string,
  fullName: string,
  branch: string,
): Promise<string> {
  const res = await githubFetch(
    `/repos/${fullName}/branches/${encodeURIComponent(branch)}`,
    accessToken,
  );
  const body = (await res.json()) as GithubBranchDetailResponse;
  return body.commit.sha;
}

interface GithubWebhookResponse {
  id: number;
}

export async function createWebhook(
  accessToken: string,
  fullName: string,
  payloadUrl: string,
  secret: string,
): Promise<string> {
  const res = await githubFetch(`/repos/${fullName}/hooks`, accessToken, {
    method: 'POST',
    body: {
      name: 'web',
      active: true,
      events: ['push'],
      config: { url: payloadUrl, content_type: 'json', secret, insecure_ssl: '0' },
    },
  });
  const body = (await res.json()) as GithubWebhookResponse;
  return String(body.id);
}

export async function deleteWebhook(
  accessToken: string,
  fullName: string,
  webhookId: string,
): Promise<void> {
  await githubFetch(`/repos/${fullName}/hooks/${webhookId}`, accessToken, { method: 'DELETE' });
}
