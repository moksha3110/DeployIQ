import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type {
  AutoDeployStatus,
  DeploymentStatus,
  DeploymentSummary,
  PaginatedResult,
} from '@platform/shared-types';
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

export function useRepoDeployments(githubRepoId: string | undefined) {
  return useQuery({
    queryKey: ['deployments', githubRepoId],
    queryFn: () =>
      apiFetch<PaginatedResult<DeploymentSummary>>(
        `/api/deployments?${new URLSearchParams({ githubRepoId: githubRepoId!, pageSize: '20' })}`,
      ),
    enabled: !!githubRepoId,
  });
}

export function useRollback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deploymentId: string) =>
      apiFetch<{ deploymentId: string }>(`/api/deployments/${deploymentId}/rollback`, {
        method: 'POST',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deployments'] }),
  });
}

export function useAutoDeployStatus(githubRepoId: string | undefined) {
  return useQuery({
    queryKey: ['auto-deploy', githubRepoId],
    queryFn: () => apiFetch<AutoDeployStatus>(`/api/repos/${githubRepoId}/auto-deploy`),
    enabled: !!githubRepoId,
  });
}

export function useSetAutoDeploy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ githubRepoId, enable }: { githubRepoId: string; enable: boolean }) =>
      apiFetch<AutoDeployStatus>(`/api/repos/${githubRepoId}/auto-deploy`, {
        method: enable ? 'POST' : 'DELETE',
      }),
    onSuccess: (_data, { githubRepoId }) =>
      queryClient.invalidateQueries({ queryKey: ['auto-deploy', githubRepoId] }),
  });
}
