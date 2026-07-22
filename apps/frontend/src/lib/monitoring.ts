import { useQuery } from '@tanstack/react-query';
import type {
  DeploymentMetrics,
  DeploymentMetricsHistory,
  MetricsRange,
} from '@platform/shared-types';
import { apiFetch } from './api';

export function useDeploymentMetrics(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['deployment-metrics', id],
    queryFn: () => apiFetch<DeploymentMetrics>(`/api/deployments/${id}/metrics`),
    enabled: !!id && enabled,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

export function useDeploymentMetricsHistory(
  id: string | undefined,
  range: MetricsRange,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['deployment-metrics-history', id, range],
    queryFn: () =>
      apiFetch<DeploymentMetricsHistory>(`/api/deployments/${id}/metrics/history?range=${range}`),
    enabled: !!id && enabled,
    refetchInterval: 30_000,
  });
}
