import { useDeploymentHealth } from '../lib/health';

const LABEL_COLORS: Record<string, string> = {
  Excellent: 'text-green-700 bg-green-100',
  Good: 'text-green-700 bg-green-100',
  Fair: 'text-amber-700 bg-amber-100',
  Poor: 'text-orange-700 bg-orange-100',
  Critical: 'text-red-700 bg-red-100',
};

const RING_COLORS: Record<string, string> = {
  Excellent: 'text-green-500',
  Good: 'text-green-500',
  Fair: 'text-amber-500',
  Poor: 'text-orange-500',
  Critical: 'text-red-500',
};

function ScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
      <circle cx="36" cy="36" r={radius} strokeWidth="8" className="stroke-slate-200 fill-none" />
      <circle
        cx="36"
        cy="36"
        r={radius}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={`fill-none ${RING_COLORS[label] ?? 'text-slate-500'}`}
        stroke="currentColor"
        transform="rotate(-90 36 36)"
      />
      <text x="36" y="41" textAnchor="middle" className="fill-slate-900 text-lg font-semibold">
        {score}
      </text>
    </svg>
  );
}

export function HealthScoreCard({ deploymentId }: { deploymentId: string }) {
  const { data: health, isPending } = useDeploymentHealth(deploymentId, true);

  if (isPending) {
    return (
      <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
        Computing health score...
      </div>
    );
  }

  if (!health) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-4">
        <ScoreRing score={health.score} label={health.label} />
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-slate-700">Health Score</h2>
          <span
            className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${LABEL_COLORS[health.label] ?? 'bg-slate-100 text-slate-600'}`}
          >
            {health.label}
          </span>
        </div>
      </div>

      {health.factors.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-slate-600">
          {health.factors.map((factor, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>{factor.reason}</span>
              <span className="shrink-0 font-mono text-xs text-red-600">-{factor.deduction}</span>
            </li>
          ))}
        </ul>
      )}
      {health.factors.length === 0 && (
        <p className="text-sm text-slate-500">No issues detected.</p>
      )}
    </div>
  );
}
