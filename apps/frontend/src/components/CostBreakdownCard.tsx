import { useDeploymentCost } from '../lib/cost';

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function CostBreakdownCard({ deploymentId }: { deploymentId: string }) {
  const { data: cost, isPending } = useDeploymentCost(deploymentId, true);

  if (isPending) {
    return (
      <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
        Estimating cost...
      </div>
    );
  }

  if (!cost) return null;

  const cpuShare = cost.monthlyCost > 0 ? (cost.monthlyCpuCost / cost.monthlyCost) * 100 : 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-slate-700">Estimated Monthly Cost</h2>
        <span className="text-2xl font-semibold text-slate-900">{money(cost.monthlyCost)}</span>
      </div>

      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="bg-blue-500" style={{ width: `${cpuShare}%` }} />
        <div className="bg-green-500" style={{ width: `${100 - cpuShare}%` }} />
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>CPU {money(cost.monthlyCpuCost)}</span>
        <span>Memory {money(cost.monthlyMemoryCost)}</span>
      </div>

      {cost.potentialMonthlySavings > 0.5 && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Right-sizing to actual usage (+20% headroom) would cost{' '}
          <span className="font-medium">{money(cost.optimizedMonthlyCost)}/mo</span> — a potential
          saving of <span className="font-medium">{money(cost.potentialMonthlySavings)}/mo</span>.
        </div>
      )}

      <p className="text-xs text-slate-400">
        Based on {cost.replicas} replica(s) × {cost.requestedCpuCores.toFixed(2)} vCPU /{' '}
        {cost.requestedMemoryGB.toFixed(2)} GB requested. {cost.pricingNote}
      </p>
    </div>
  );
}
