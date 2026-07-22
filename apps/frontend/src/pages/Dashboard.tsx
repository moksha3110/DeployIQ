import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@platform/shared-types';
import { apiFetch } from '../lib/api';

// Placeholder landing page proving the frontend/backend/shared-types wiring
// works end-to-end. Replaced by the real dashboard (repo list, deploy
// button, deployment history) in Milestone 2.
export function Dashboard() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthResponse>('/health'),
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold text-slate-900">Deployment Platform</h1>
      <p className="text-slate-600">Milestone 0 — scaffolding check.</p>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm">
        {isPending && <span className="text-slate-500">checking backend...</span>}
        {isError && (
          <span className="text-red-600">backend unreachable: {(error as Error).message}</span>
        )}
        {data && (
          <span className="text-green-700">
            backend {data.status} · {data.service} · {data.timestamp}
          </span>
        )}
      </div>
    </main>
  );
}
