import { useQuery } from '@tanstack/react-query';
import type { Incident } from '@platform/shared-types';
import { apiFetch } from './api';

export function useIncidents(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['deployment-incidents', id],
    queryFn: () => apiFetch<Incident[]>(`/api/deployments/${id}/incidents`),
    enabled: !!id && enabled,
    refetchInterval: 30_000,
  });
}
