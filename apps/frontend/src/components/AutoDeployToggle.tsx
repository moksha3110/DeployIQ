import { useAutoDeployStatus, useSetAutoDeploy } from '../lib/deployments';

export function AutoDeployToggle({ githubRepoId }: { githubRepoId: string }) {
  const { data: status, isPending } = useAutoDeployStatus(githubRepoId);
  const setAutoDeploy = useSetAutoDeploy();

  if (isPending || !status) return null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-900">Auto-deploy on push</p>
        <p className="text-xs text-slate-500">
          {status.enabled
            ? 'Redeploys automatically when the default branch gets a new commit.'
            : 'Off — deployments only happen when you click Deploy.'}
        </p>
      </div>
      <button
        onClick={() => setAutoDeploy.mutate({ githubRepoId, enable: !status.enabled })}
        disabled={setAutoDeploy.isPending}
        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
          status.enabled
            ? 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            : 'bg-slate-900 text-white hover:bg-slate-800'
        }`}
      >
        {status.enabled ? 'Disable' : 'Enable'}
      </button>
      {setAutoDeploy.isError && (
        <p className="ml-4 max-w-xs text-right text-xs text-red-600">
          {setAutoDeploy.error instanceof Error
            ? setAutoDeploy.error.message
            : 'Something went wrong.'}
        </p>
      )}
    </div>
  );
}
