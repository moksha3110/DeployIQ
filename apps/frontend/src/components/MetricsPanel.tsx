import { formatCpu, formatMemory } from '../lib/format';
import { useDeploymentMetrics, useDeploymentMetricsHistory } from '../lib/monitoring';
import { Sparkline } from './Sparkline';

export function MetricsPanel({ deploymentId }: { deploymentId: string }) {
  const { data: metrics } = useDeploymentMetrics(deploymentId, true);
  const { data: history } = useDeploymentMetricsHistory(deploymentId, '1h', true);

  if (!metrics) return null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4">
      <h2 className="text-sm font-medium text-slate-700">Monitoring</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Pods" value={String(metrics.podCount)} />
        <Stat label="Replicas" value={`${metrics.availableReplicas}/${metrics.desiredReplicas}`} />
        <Stat label="CPU" value={formatCpu(metrics.cpuCores)} />
        <Stat label="Memory" value={formatMemory(metrics.memoryBytes)} />
        <Stat label="Restarts" value={String(metrics.restarts)} warn={metrics.restarts > 0} />
      </div>

      {history && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-slate-500">CPU (last hour)</p>
            <Sparkline samples={history.cpu} color="#2563eb" />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">Memory (last hour)</p>
            <Sparkline samples={history.memory} color="#16a34a" />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-semibold ${warn ? 'text-amber-600' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  );
}
