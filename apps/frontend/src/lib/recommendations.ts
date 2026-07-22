import { useQuery } from '@tanstack/react-query';
import type { RecommendationsResponse } from '@platform/shared-types';
import { apiFetch } from './api';

// Deliberately no refetchInterval — unlike metrics/health this calls the
// Anthropic API, so it should only run when a human opens the card, not on
// a poll loop. staleTime keeps a manual refresh (invalidating the query)
// from being immediately clobbered by React Query's own background refetch.
export function useRecommendations(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['deployment-recommendations', id],
    queryFn: () => apiFetch<RecommendationsResponse>(`/api/deployments/${id}/recommendations`),
    enabled: !!id && enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
