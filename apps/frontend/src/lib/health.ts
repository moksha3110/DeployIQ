import { useQuery } from '@tanstack/react-query';
import type { HealthScore, HealthScoreHistoryPoint } from '@platform/shared-types';
import { apiFetch, ApiError } from './api';

export function useDeploymentHealth(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['deployment-health', id],
    queryFn: async () => {
      try {
        return await apiFetch<HealthScore>(`/api/deployments/${id}/health`);
      } catch (err) {
        // 409 means the namespace exists but the live Deployment doesn't
        // (yet, or anymore) — a legitimate transient state, not an error.
        if (err instanceof ApiError && err.status === 409) return null;
        throw err;
      }
    },
    enabled: !!id && enabled,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useDeploymentHealthHistory(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['deployment-health-history', id],
    queryFn: () => apiFetch<HealthScoreHistoryPoint[]>(`/api/deployments/${id}/health/history`),
    enabled: !!id && enabled,
    refetchInterval: 60_000,
  });
}
