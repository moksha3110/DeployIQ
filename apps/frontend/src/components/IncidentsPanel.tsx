import { useIncidents } from '../lib/incidents';

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-700 bg-red-100',
  HIGH: 'text-orange-700 bg-orange-100',
  MEDIUM: 'text-amber-700 bg-amber-100',
  LOW: 'text-slate-700 bg-slate-100',
};

const TYPE_LABELS: Record<string, string> = {
  CRASH_LOOP_BACKOFF: 'Crash loop',
  IMAGE_PULL_ERROR: 'Image pull error',
  OOM_KILLED: 'Out of memory',
  PENDING_UNSCHEDULABLE: 'Unschedulable',
  OTHER: 'Other',
};

export function IncidentsPanel({ deploymentId }: { deploymentId: string }) {
  const { data: incidents, isPending } = useIncidents(deploymentId, true);

  if (isPending) {
    return (
      <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
        Scanning for incidents...
      </div>
    );
  }

  if (!incidents || incidents.length === 0) return null;

  const open = incidents.filter((i) => i.status === 'OPEN');
  const resolved = incidents.filter((i) => i.status === 'RESOLVED');

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
      <h2 className="text-sm font-medium text-slate-700">Incidents</h2>

      {open.length === 0 && <p className="text-sm text-slate-500">No active incidents.</p>}

      {[...open, ...resolved.slice(0, 5)].map((incident) => (
        <div
          key={incident.id}
          className={`flex flex-col gap-1 rounded-md border p-3 ${
            incident.status === 'OPEN'
              ? 'border-red-100 bg-red-50'
              : 'border-slate-100 bg-slate-50 opacity-70'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-900">
              {TYPE_LABELS[incident.type] ?? incident.type}
              {incident.status === 'RESOLVED' && ' (resolved)'}
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[incident.priority] ?? 'bg-slate-100 text-slate-600'}`}
            >
              {incident.priority.toLowerCase()}
            </span>
          </div>
          <p className="text-sm text-slate-600">{incident.rootCause}</p>
          <p className="text-sm text-slate-800">
            <span className="font-medium">Next step:</span> {incident.recommendedAction}
          </p>
          <p className="text-xs text-slate-400">
            {incident.occurrenceCount > 1 && `Seen ${incident.occurrenceCount} times — `}
            first seen {new Date(incident.firstSeenAt).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
