import type { DeploymentMetrics } from '@platform/shared-types';
import type { LiveDeploymentSpec } from '../kubernetes/inspect.js';
import { getLiveDeploymentSpec } from '../kubernetes/inspect.js';
import { parseCpuQuantity, parseMemoryQuantity } from './health-score.js';
import { getSnapshot } from '../monitoring/metrics.js';

// No real cloud billing API is wired up (this platform targets Minikube
// locally), so cost is an estimate against a documented blended rate — the
// same approach tools like Kubecost use as their "default pricing" before
// a real cloud billing integration is configured. Roughly AWS EC2 general-
// purpose on-demand pricing (m-family, us-east-1, 2026 list price) divided
// down to a per-vCPU/per-GB hourly rate; swapping this for a real
// CUR/Cost-Explorer integration is a config change, not a rewrite, since
// every caller only ever sees the CostBreakdown shape below.
export const CPU_RATE_PER_CORE_HOUR = 0.0464;
export const MEMORY_RATE_PER_GB_HOUR = 0.0058;
export const HOURS_PER_MONTH = 730;
const GB = 1024 ** 3;

// Real containers never request literally 0 — this is a floor so the
// "optimized" estimate for an idle deployment isn't a nonsensical $0/mo,
// which would make the savings number meaningless.
const MIN_CPU_CORES = 0.01; // 10m
const MIN_MEMORY_GB = 16 / 1024; // 16Mi

export interface CostBreakdown {
  replicas: number;
  requestedCpuCores: number;
  requestedMemoryGB: number;
  actualCpuCores: number;
  actualMemoryGB: number;
  monthlyCpuCost: number;
  monthlyMemoryCost: number;
  monthlyCost: number;
  optimizedMonthlyCost: number;
  potentialMonthlySavings: number;
  pricingNote: string;
}

function monthlyResourceCost(cpuCores: number, memoryGB: number, replicas: number): number {
  return (
    (cpuCores * CPU_RATE_PER_CORE_HOUR + memoryGB * MEMORY_RATE_PER_GB_HOUR) *
    replicas *
    HOURS_PER_MONTH
  );
}

// Pure, so it's testable against fixed inputs (see cost.test.ts).
export function computeCost(spec: LiveDeploymentSpec, metrics: DeploymentMetrics): CostBreakdown {
  const replicas = Math.max(1, spec.desiredReplicas);

  // Falls back to actual usage when no request is set — an un-pinned
  // deployment doesn't "cost" $0, the scheduler still has to place it
  // somewhere sized for what it actually uses.
  const requestedCpuCores =
    parseCpuQuantity(spec.resources?.requests.cpu ?? null) ?? metrics.cpuCores;
  const requestedMemoryGB =
    (parseMemoryQuantity(spec.resources?.requests.memory ?? null) ?? metrics.memoryBytes) / GB;

  const actualCpuCores = metrics.cpuCores;
  const actualMemoryGB = metrics.memoryBytes / GB;

  const monthlyCpuCost = requestedCpuCores * CPU_RATE_PER_CORE_HOUR * replicas * HOURS_PER_MONTH;
  const monthlyMemoryCost =
    requestedMemoryGB * MEMORY_RATE_PER_GB_HOUR * replicas * HOURS_PER_MONTH;
  const monthlyCost = monthlyCpuCost + monthlyMemoryCost;

  // "Optimized" = actual usage plus 20% headroom, not usage exactly — a
  // request that matches usage exactly leaves zero burst room and would
  // just trade cost for a resource-pressure problem (see health-score.ts).
  const optimizedCpu = Math.max(actualCpuCores * 1.2, MIN_CPU_CORES);
  const optimizedMemory = Math.max(actualMemoryGB * 1.2, MIN_MEMORY_GB);
  const optimizedMonthlyCost = monthlyResourceCost(optimizedCpu, optimizedMemory, replicas);

  return {
    replicas,
    requestedCpuCores,
    requestedMemoryGB,
    actualCpuCores,
    actualMemoryGB,
    monthlyCpuCost,
    monthlyMemoryCost,
    monthlyCost,
    optimizedMonthlyCost,
    potentialMonthlySavings: Math.max(0, monthlyCost - optimizedMonthlyCost),
    pricingNote: `Estimated at $${CPU_RATE_PER_CORE_HOUR}/vCPU-hr and $${MEMORY_RATE_PER_GB_HOUR}/GB-hr (blended general-purpose on-demand rate) — no cloud billing API connected.`,
  };
}

export async function computeCostForDeployment(
  namespace: string,
  appName: string,
): Promise<CostBreakdown> {
  const [spec, metrics] = await Promise.all([
    getLiveDeploymentSpec(namespace, appName),
    getSnapshot(namespace),
  ]);
  return computeCost(spec, metrics);
}
