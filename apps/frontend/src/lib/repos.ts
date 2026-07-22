import { useQuery } from '@tanstack/react-query';
import type { BranchSummary, PaginatedResult, RepositorySummary } from '@platform/shared-types';
import { apiFetch } from './api';

export function useRepos(search: string, page: number, pageSize = 10) {
  return useQuery({
    queryKey: ['repos', search, page, pageSize],
    queryFn: () =>
      apiFetch<PaginatedResult<RepositorySummary>>(
        `/api/repos?${new URLSearchParams({
          search,
          page: String(page),
          pageSize: String(pageSize),
        })}`,
      ),
    placeholderData: (previous) => previous,
  });
}

export function useRepo(repoId: string | undefined) {
  return useQuery({
    queryKey: ['repo', repoId],
    queryFn: () => apiFetch<RepositorySummary>(`/api/repos/${repoId}`),
    enabled: !!repoId,
  });
}

export function useBranches(repoId: string | undefined) {
  return useQuery({
    queryKey: ['branches', repoId],
    queryFn: () => apiFetch<BranchSummary[]>(`/api/repos/${repoId}/branches`),
    enabled: !!repoId,
  });
}
