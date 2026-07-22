import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { DeploymentStatus, DeploymentSummary } from '@platform/shared-types';
import { API_BASE_URL, apiFetch } from './api';

const TERMINAL_STATUSES: DeploymentStatus[] = [
  'RUNNING',
  'BUILD_FAILED',
  'DEPLOY_FAILED',
  'STOPPED',
];

export function useCreateDeployment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { repositoryId: string; branch: string }) =>
      apiFetch<{ deploymentId: string }>('/api/deployments', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deployments'] }),
  });
}

type DeploymentDetail = DeploymentSummary & { repositoryFullName: string };

export function useDeployment(id: string | undefined) {
  return useQuery({
    queryKey: ['deployment', id],
    queryFn: () => apiFetch<DeploymentDetail>(`/api/deployments/${id}`),
    enabled: !!id,
    // Poll while the deployment is still in flight; stop once it lands on
    // a terminal status so we're not hammering the API forever.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || TERMINAL_STATUSES.includes(status)) return false;
      return 2000;
    },
    // The global default disables this (repo browsing shouldn't refetch on
    // every alt-tab), but a live build/deploy in progress should catch up
    // immediately if the user tabbed away and came back mid-build.
    refetchOnWindowFocus: true,
  });
}

export interface LogLine {
  stage: string;
  level: string;
  message: string;
  timestamp: string;
}

export function useDeploymentLogs(id: string | undefined) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!id) return;
    setLines([]);

    const source = new EventSource(`${API_BASE_URL}/api/deployments/${id}/logs`, {
      withCredentials: true,
    });
    sourceRef.current = source;

    source.onmessage = (event) => {
      const line = JSON.parse(event.data) as LogLine;
      setLines((prev) => [...prev, line]);
    };

    return () => source.close();
  }, [id]);

  return lines;
}
