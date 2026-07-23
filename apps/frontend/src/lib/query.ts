import { useMutation } from '@tanstack/react-query';
import type { QueryResponse } from '@platform/shared-types';
import { apiFetch } from './api';

export function useAskDeployment(id: string | undefined) {
  return useMutation({
    mutationFn: (question: string) =>
      apiFetch<QueryResponse>(`/api/deployments/${id}/query`, {
        method: 'POST',
        body: JSON.stringify({ question }),
      }),
  });
}
