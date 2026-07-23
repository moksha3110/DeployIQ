import { useQuery } from '@tanstack/react-query';
import type { TopologyGraph } from '@platform/shared-types';
import { apiFetch, ApiError } from './api';

export function useTopology(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['deployment-topology', id],
    queryFn: async () => {
      try {
        return await apiFetch<TopologyGraph>(`/api/deployments/${id}/topology`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return null;
        throw err;
      }
    },
    enabled: !!id && enabled,
    refetchInterval: 15_000,
  });
}
