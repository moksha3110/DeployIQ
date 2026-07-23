import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AIAnalysisCard } from '../components/AIAnalysisCard';
import { AskAIPanel } from '../components/AskAIPanel';
import { CostBreakdownCard } from '../components/CostBreakdownCard';
import { HealthScoreCard } from '../components/HealthScoreCard';
import { IncidentsPanel } from '../components/IncidentsPanel';
import { MetricsPanel } from '../components/MetricsPanel';
import { RecommendationsCard } from '../components/RecommendationsCard';
import { SecurityScoreCard } from '../components/SecurityScoreCard';
import { useDeployment, useDeploymentLogs } from '../lib/deployments';

// Namespace (and therefore metrics) only exists once the Kubernetes Service
// has started applying manifests — see modules/kubernetes/pipeline.ts.
const NAMESPACE_EXISTS_STATUSES = ['DEPLOYING', 'RUNNING', 'DEPLOY_FAILED'];
const FAILED_STATUSES = ['BUILD_FAILED', 'DEPLOY_FAILED'];

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

          {FAILED_STATUSES.includes(deployment.status) && (
            <AIAnalysisCard deploymentId={deployment.id} />
          )}

          {NAMESPACE_EXISTS_STATUSES.includes(deployment.status) && (
            <>
              <HealthScoreCard deploymentId={deployment.id} />
              <AskAIPanel deploymentId={deployment.id} />
              <CostBreakdownCard deploymentId={deployment.id} />
              <IncidentsPanel deploymentId={deployment.id} />
              <SecurityScoreCard deploymentId={deployment.id} />
              <RecommendationsCard deploymentId={deployment.id} />
              <MetricsPanel deploymentId={deployment.id} />
              <div className="flex gap-4">
                <Link
                  to={`/deployments/${deployment.id}/analytics`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  View full resource analytics &rarr;
                </Link>
                <Link
                  to={`/deployments/${deployment.id}/topology`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  View infrastructure topology &rarr;
                </Link>
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-slate-700">Build logs</h2>
            <pre className="h-96 overflow-y-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
              {logs.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.level === 'ERROR'
                      ? 'text-red-400'
                      : line.level === 'WARN'
                        ? 'text-amber-400'
                        : undefined
                  }
                >
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
