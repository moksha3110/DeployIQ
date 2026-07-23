import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { MetricsRange } from '@platform/shared-types';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCpu, formatMemory } from '../lib/format';
import { useDeploymentMetricsHistory } from '../lib/monitoring';
import { useDeploymentHealthHistory } from '../lib/health';
import { useDeployment } from '../lib/deployments';

const RANGES: MetricsRange[] = ['1h', '24h', '7d', '30d'];

function timeTick(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DeploymentAnalytics() {
  const { id } = useParams<{ id: string }>();
  const { data: deployment } = useDeployment(id);
  const [range, setRange] = useState<MetricsRange>('24h');

  const { data: history, isPending: metricsPending } = useDeploymentMetricsHistory(id, range, true);
  const { data: healthHistory, isPending: healthPending } = useDeploymentHealthHistory(id, true);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-12">
      <Link to={id ? `/deployments/${id}` : '/'} className="text-sm text-slate-500 hover:underline">
        &larr; Back to deployment
      </Link>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Resource Analytics</h1>
          {deployment && (
            <p className="text-sm text-slate-500">
              {deployment.repositoryFullName} — {deployment.branch}
            </p>
          )}
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                r === range ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </header>

      <section className="rounded-lg border border-slate-200 p-4">
        <h2 className="mb-2 text-sm font-medium text-slate-700">CPU usage</h2>
        {metricsPending && <p className="text-sm text-slate-500">Loading...</p>}
        {history && history.cpu.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={history.cpu}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={timeTick}
                tick={{ fontSize: 11 }}
                minTickGap={40}
              />
              <YAxis tickFormatter={(v) => formatCpu(v)} tick={{ fontSize: 11 }} width={50} />
              <Tooltip
                labelFormatter={(v) => timeTick(Number(v))}
                formatter={(v) => [formatCpu(Number(v)), 'CPU']}
              />
              <Line type="monotone" dataKey="value" stroke="#2563eb" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
        {history && history.cpu.length === 0 && (
          <p className="text-sm text-slate-500">No data for this range yet.</p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h2 className="mb-2 text-sm font-medium text-slate-700">Memory usage</h2>
        {history && history.memory.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={history.memory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={timeTick}
                tick={{ fontSize: 11 }}
                minTickGap={40}
              />
              <YAxis tickFormatter={(v) => formatMemory(v)} tick={{ fontSize: 11 }} width={60} />
              <Tooltip
                labelFormatter={(v) => timeTick(Number(v))}
                formatter={(v) => [formatMemory(Number(v)), 'Memory']}
              />
              <Line type="monotone" dataKey="value" stroke="#16a34a" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
        {history && history.memory.length === 0 && (
          <p className="text-sm text-slate-500">No data for this range yet.</p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <h2 className="mb-2 text-sm font-medium text-slate-700">Health score trend</h2>
        <p className="mb-2 text-xs text-slate-400">
          Sampled every 5 minutes independent of Prometheus retention — accumulates from when this
          deployment first went RUNNING.
        </p>
        {healthPending && <p className="text-sm text-slate-500">Loading...</p>}
        {healthHistory && healthHistory.length > 1 && (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={healthHistory.map((h) => ({ ...h, ts: new Date(h.timestamp).getTime() }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="ts"
                tickFormatter={timeTick}
                tick={{ fontSize: 11 }}
                minTickGap={40}
              />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={40} />
              <Tooltip labelFormatter={(v) => timeTick(Number(v))} />
              <Line type="monotone" dataKey="score" stroke="#7c3aed" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
        {healthHistory && healthHistory.length <= 1 && (
          <p className="text-sm text-slate-500">
            Not enough history yet — snapshots are taken every 5 minutes.
          </p>
        )}
      </section>
    </main>
  );
}
