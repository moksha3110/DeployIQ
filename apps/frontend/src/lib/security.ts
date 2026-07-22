import { useQuery } from '@tanstack/react-query';
import type { SecurityScore } from '@platform/shared-types';
import { apiFetch, ApiError } from './api';

export function useDeploymentSecurity(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['deployment-security', id],
    queryFn: async () => {
      try {
        return await apiFetch<SecurityScore>(`/api/deployments/${id}/security`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return null;
        throw err;
      }
    },
    enabled: !!id && enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
