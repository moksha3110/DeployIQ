import { useState } from 'react';
import { useDeploymentSecurity } from '../lib/security';

const GRADE_COLORS: Record<string, string> = {
  A: 'text-green-700 bg-green-100',
  B: 'text-green-700 bg-green-100',
  C: 'text-amber-700 bg-amber-100',
  D: 'text-orange-700 bg-orange-100',
  F: 'text-red-700 bg-red-100',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-700 bg-red-100',
  high: 'text-orange-700 bg-orange-100',
  medium: 'text-amber-700 bg-amber-100',
  low: 'text-slate-700 bg-slate-100',
};

export function SecurityScoreCard({ deploymentId }: { deploymentId: string }) {
  const { data: security, isPending } = useDeploymentSecurity(deploymentId, true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isPending) {
    return (
      <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
        Scanning security posture...
      </div>
    );
  }

  if (!security) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl font-bold ${GRADE_COLORS[security.grade]}`}
        >
          {security.grade}
        </span>
        <div>
          <h2 className="text-sm font-medium text-slate-700">Security Score</h2>
          <p className="text-xs text-slate-500">{security.score}/100</p>
        </div>
      </div>

      {security.findings.length === 0 && (
        <p className="text-sm text-slate-500">No security findings.</p>
      )}

      {security.findings.length > 0 && (
        <ul className="flex flex-col gap-2">
          {security.findings.map((finding) => {
            const expanded = expandedId === finding.id;
            return (
              <li key={finding.id} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : finding.id)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="text-sm font-medium text-slate-900">{finding.title}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[finding.severity]}`}
                  >
                    {finding.severity}
                  </span>
                </button>
                {expanded && (
                  <div className="mt-2 flex flex-col gap-2">
                    <p className="text-sm text-slate-600">{finding.description}</p>
                    <pre className="overflow-x-auto rounded bg-slate-950 p-2 text-xs text-slate-100">
                      {finding.fix}
                    </pre>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
