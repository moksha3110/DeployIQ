import { useQuery } from '@tanstack/react-query';
import type { DeploymentAnalysis } from '@platform/shared-types';
import { apiFetch, ApiError } from './api';

export function useDeploymentAnalysis(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['deployment-analysis', id],
    queryFn: async () => {
      try {
        return await apiFetch<DeploymentAnalysis>(`/api/deployments/${id}/analysis`);
      } catch (err) {
        // 404 means "no analysis yet" (still running, or AI isn't
        // configured) — a valid steady state, not a fetch failure.
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !!id && enabled,
    // The pipeline calls the model asynchronously right after marking the
    // deployment failed, so it may not exist the instant the UI checks —
    // a few short retries covers that. Capped so a deployment with no
    // ANTHROPIC_API_KEY configured (permanently null) doesn't poll forever.
    refetchInterval: (query) => {
      if (query.state.data) return false;
      return query.state.dataUpdateCount < 6 ? 3000 : false;
    },
  });
}
