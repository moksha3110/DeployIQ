import { useQueryClient } from '@tanstack/react-query';
import { useRecommendations } from '../lib/recommendations';

const SEVERITY_COLORS: Record<string, string> = {
  high: 'text-red-700 bg-red-100',
  medium: 'text-amber-700 bg-amber-100',
  low: 'text-slate-700 bg-slate-100',
};

export function RecommendationsCard({ deploymentId }: { deploymentId: string }) {
  const queryClient = useQueryClient();
  const { data, isPending, isFetching } = useRecommendations(deploymentId, true);

  if (isPending) {
    return (
      <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
        Generating recommendations...
      </div>
    );
  }

  if (!data) return null;

  if (!data.aiConfigured) {
    return (
      <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
        AI recommendations unavailable — no ANTHROPIC_API_KEY configured.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">AI Recommendations</h2>
        <button
          type="button"
          disabled={isFetching}
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ['deployment-recommendations', deploymentId] })
          }
          className="text-xs text-blue-600 hover:underline disabled:text-slate-400"
        >
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {data.recommendations.length === 0 && (
        <p className="text-sm text-slate-500">No recommendations — this deployment looks well-configured.</p>
      )}

      {data.recommendations.map((rec, i) => (
        <div key={i} className="flex flex-col gap-1 rounded-md border border-slate-100 bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-900">{rec.problem}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_COLORS[rec.severity] ?? 'bg-slate-100 text-slate-600'}`}
            >
              {rec.severity}
            </span>
          </div>
          <p className="text-sm text-slate-600">{rec.reason}</p>
          <p className="text-sm text-slate-600">
            <span className="font-medium">Impact:</span> {rec.impact}
          </p>
          <p className="text-sm text-slate-800">
            <span className="font-medium">Fix:</span> {rec.fix}
          </p>
        </div>
      ))}
    </div>
  );
}
