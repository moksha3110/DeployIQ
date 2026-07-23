import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BarChart3, ExternalLink, FileDown, Network } from 'lucide-react';
import { API_BASE_URL } from '../lib/api';
import { AIAnalysisCard } from '../components/AIAnalysisCard';
import { AskAIPanel } from '../components/AskAIPanel';
import { CostBreakdownCard } from '../components/CostBreakdownCard';
import { HealthScoreCard } from '../components/HealthScoreCard';
import { IncidentsPanel } from '../components/IncidentsPanel';
import { MetricsPanel } from '../components/MetricsPanel';
import { RecommendationsCard } from '../components/RecommendationsCard';
import { SecurityScoreCard } from '../components/SecurityScoreCard';
import { useDeployment, useDeploymentLogs } from '../lib/deployments';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

// Namespace (and therefore metrics) only exists once the Kubernetes Service
// has started applying manifests — see modules/kubernetes/pipeline.ts.
const NAMESPACE_EXISTS_STATUSES = ['DEPLOYING', 'RUNNING', 'DEPLOY_FAILED'];
const FAILED_STATUSES = ['BUILD_FAILED', 'DEPLOY_FAILED'];

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'success'> = {
  RUNNING: 'success',
  BUILD_FAILED: 'destructive',
  DEPLOY_FAILED: 'destructive',
};

export function DeploymentDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: deployment } = useDeployment(id);
  const logs = useDeploymentLogs(id);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [logs.length]);

  if (!deployment) return null;

  const infraReady = NAMESPACE_EXISTS_STATUSES.includes(deployment.status);

  return (
    <main className="flex flex-col gap-6 px-6 py-8">
      <Link to="/" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to repositories
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {deployment.repositoryFullName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {deployment.branch} @ {deployment.commitSha.slice(0, 7)}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[deployment.status] ?? 'secondary'}>
          {deployment.status}
        </Badge>
      </header>

      {deployment.publicUrl && (
        <a
          href={deployment.publicUrl}
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-1 text-sm text-primary hover:underline"
        >
          {deployment.publicUrl} <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}

      {FAILED_STATUSES.includes(deployment.status) && (
        <AIAnalysisCard deploymentId={deployment.id} />
      )}

      {infraReady && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/deployments/${deployment.id}/analytics`}>
                <BarChart3 className="mr-1.5 h-4 w-4" />
                Resource analytics
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/deployments/${deployment.id}/topology`}>
                <Network className="mr-1.5 h-4 w-4" />
                Infrastructure topology
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`${API_BASE_URL}/api/deployments/${deployment.id}/report.pdf`}>
                <FileDown className="mr-1.5 h-4 w-4" />
                Download PDF report
              </a>
            </Button>
          </div>

          <Tabs defaultValue="health">
            <TabsList>
              <TabsTrigger value="health">Health</TabsTrigger>
              <TabsTrigger value="cost">Cost</TabsTrigger>
              <TabsTrigger value="incidents">Incidents</TabsTrigger>
              <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
              <TabsTrigger value="ask">Ask AI</TabsTrigger>
            </TabsList>

            <TabsContent value="health" className="flex flex-col gap-4">
              <HealthScoreCard deploymentId={deployment.id} />
              <SecurityScoreCard deploymentId={deployment.id} />
              <MetricsPanel deploymentId={deployment.id} />
            </TabsContent>

            <TabsContent value="cost">
              <CostBreakdownCard deploymentId={deployment.id} />
            </TabsContent>

            <TabsContent value="incidents">
              <IncidentsPanel deploymentId={deployment.id} />
            </TabsContent>

            <TabsContent value="recommendations">
              <RecommendationsCard deploymentId={deployment.id} />
            </TabsContent>

            <TabsContent value="ask">
              <AskAIPanel deploymentId={deployment.id} />
            </TabsContent>
          </Tabs>
        </>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-foreground">Build logs</h2>
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
    </main>
  );
}
