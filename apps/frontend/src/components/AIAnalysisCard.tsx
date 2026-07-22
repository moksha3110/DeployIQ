import { useDeploymentAnalysis } from '../lib/ai';

function confidenceLabel(confidence: number): { text: string; color: string } {
  if (confidence >= 0.7) return { text: 'High confidence', color: 'text-green-700 bg-green-100' };
  if (confidence >= 0.4) return { text: 'Medium confidence', color: 'text-amber-700 bg-amber-100' };
  return { text: 'Low confidence', color: 'text-slate-700 bg-slate-100' };
}

export function AIAnalysisCard({ deploymentId }: { deploymentId: string }) {
  const { data: analysis, isPending } = useDeploymentAnalysis(deploymentId, true);

  if (isPending) {
    return (
      <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
        Analyzing failure...
      </div>
    );
  }

  // Not an error — either the model hasn't finished yet (see refetchInterval
  // in lib/ai.ts) or no ANTHROPIC_API_KEY is configured. Either way, there's
  // nothing useful to show; the raw logs below still tell the full story.
  if (!analysis) return null;

  const confidence = confidenceLabel(analysis.confidence);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">AI Diagnosis</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${confidence.color}`}>
          {confidence.text} ({Math.round(analysis.confidence * 100)}%)
        </span>
      </div>

      <p className="text-sm text-slate-900">{analysis.rootCause}</p>

      {analysis.likelyConfigIssue && (
        <p className="text-sm text-slate-600">
          <span className="font-medium">Likely config issue:</span> {analysis.likelyConfigIssue}
        </p>
      )}

      {analysis.suggestedFixes.length > 0 && (
        <div>
          <p className="text-sm font-medium text-slate-700">Suggested fixes</p>
          <ul className="list-disc pl-5 text-sm text-slate-700">
            {analysis.suggestedFixes.map((fix, i) => (
              <li key={i}>{fix}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
