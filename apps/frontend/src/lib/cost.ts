import { useQuery } from '@tanstack/react-query';
import type { CostBreakdown } from '@platform/shared-types';
import { apiFetch, ApiError } from './api';

export function useDeploymentCost(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['deployment-cost', id],
    queryFn: async () => {
      try {
        return await apiFetch<CostBreakdown>(`/api/deployments/${id}/cost`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return null;
        throw err;
      }
    },
    enabled: !!id && enabled,
    refetchInterval: 30_000,
  });
}
