import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDeployment, useDeploymentLogs } from '../lib/deployments';

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

export function DeploymentDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: deployment } = useDeployment(id);
  const logs = useDeploymentLogs(id);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [logs.length]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <Link to="/" className="text-sm text-slate-500 hover:underline">
        &larr; Back to repositories
      </Link>

      {deployment && (
        <>
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                {deployment.repositoryFullName}
              </h1>
              <p className="text-sm text-slate-500">
                {deployment.branch} @ {deployment.commitSha.slice(0, 7)}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[deployment.status] ?? 'bg-slate-100 text-slate-600'}`}
            >
              {deployment.status}
            </span>
          </header>

          {deployment.publicUrl && (
            <a
              href={deployment.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              {deployment.publicUrl}
            </a>
          )}

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-slate-700">Build logs</h2>
            <pre className="h-96 overflow-y-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
              {logs.map((line, i) => (
                <div key={i} className={line.level === 'ERROR' ? 'text-red-400' : undefined}>
                  [{line.stage}] {line.message}
                </div>
              ))}
              <div ref={logEndRef} />
            </pre>
          </div>
        </>
      )}
    </main>
  );
}
