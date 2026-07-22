import { Link, useNavigate } from 'react-router-dom';
import { useRepoDeployments, useRollback } from '../lib/deployments';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-600',
  CLONING: 'bg-blue-100 text-blue-700',
  BUILDING: 'bg-blue-100 text-blue-700',
  PUSHING: 'bg-blue-100 text-blue-700',
  DEPLOYING: 'bg-blue-100 text-blue-700',
  RUNNING: 'bg-green-100 text-green-700',
  BUILD_FAILED: 'bg-red-100 text-red-700',
  DEPLOY_FAILED: 'bg-red-100 text-red-700',
  STOPPED: 'bg-slate-100 text-slate-600',
};

const TRIGGER_LABELS: Record<string, string> = {
  MANUAL: 'manual',
  WEBHOOK: 'push',
  ROLLBACK: 'rollback',
  REDEPLOY: 'redeploy',
};

export function DeploymentHistory({ githubRepoId }: { githubRepoId: string }) {
  const { data, isPending } = useRepoDeployments(githubRepoId);
  const rollback = useRollback();
  const navigate = useNavigate();

  if (isPending) return <p className="text-sm text-slate-500">Loading deployment history...</p>;
  if (!data || data.items.length === 0) {
    return <p className="text-sm text-slate-500">No deployments yet.</p>;
  }

  async function handleRollback(deploymentId: string) {
    const { deploymentId: newId } = await rollback.mutateAsync(deploymentId);
    navigate(`/deployments/${newId}`);
  }

  return (
    <ul className="flex flex-col divide-y divide-slate-200 rounded-lg border border-slate-200">
      {data.items.map((deployment) => (
        <li key={deployment.id} className="flex items-center justify-between px-4 py-3">
          <Link
            to={`/deployments/${deployment.id}`}
            className="flex flex-col gap-1 hover:underline"
          >
            <span className="text-sm text-slate-900">
              {deployment.branch} @ {deployment.commitSha.slice(0, 7)}
              <span className="ml-2 text-xs text-slate-400">
                {TRIGGER_LABELS[deployment.triggeredBy] ?? deployment.triggeredBy.toLowerCase()}
              </span>
            </span>
            <span className="text-xs text-slate-500">
              {new Date(deployment.createdAt).toLocaleString()}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[deployment.status] ?? 'bg-slate-100 text-slate-600'}`}
            >
              {deployment.status}
            </span>
            {deployment.status === 'RUNNING' && (
              <button
                onClick={() => handleRollback(deployment.id)}
                disabled={rollback.isPending}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              >
                Roll back to this
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
