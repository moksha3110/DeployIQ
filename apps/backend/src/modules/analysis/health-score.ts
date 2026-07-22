import type { DeploymentMetrics } from '@platform/shared-types';
import type { LiveDeploymentSpec, LivePodStatus } from '../kubernetes/inspect.js';
import { getLiveDeploymentSpec, getLivePods, LiveResourceNotFoundError } from '../kubernetes/inspect.js';
import { getSnapshot } from '../monitoring/metrics.js';

export interface HealthScoreFactor {
  category: string;
  deduction: number;
  reason: string;
}

export interface HealthScoreResult {
  score: number;
  label: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical';
  factors: HealthScoreFactor[];
  metrics: DeploymentMetrics;
}

// Parses Kubernetes quantity strings ("500m" CPU, "512Mi" memory) into a
// single unit (cores, bytes) so they're comparable to Prometheus's own
// output, which already reports in those units.
const MEMORY_UNITS: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  K: 1000,
  M: 1000 ** 2,
  G: 1000 ** 3,
};

export function parseCpuQuantity(value: string | null): number | null {
  if (!value) return null;
  if (value.endsWith('m')) return Number(value.slice(0, -1)) / 1000;
  return Number(value);
}

export function parseMemoryQuantity(value: string | null): number | null {
  if (!value) return null;
  const unit = Object.keys(MEMORY_UNITS).find((u) => value.endsWith(u));
  if (!unit) return Number(value); // plain byte count
  return Number(value.slice(0, -unit.length)) * MEMORY_UNITS[unit]!;
}

function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function labelFor(score: number): HealthScoreResult['label'] {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 25) return 'Poor';
  return 'Critical';
}

const BAD_REASON_DEDUCTIONS: Record<string, number> = {
  CrashLoopBackOff: 35,
  ImagePullBackOff: 35,
  ErrImagePull: 35,
  OOMKilled: 30,
  Error: 20,
};

// Pure scoring logic, split out from computeHealthScore so it's testable
// against fixed inputs without a live cluster/Prometheus (see
// health-score.test.ts). computeHealthScore below is the thin I/O wrapper.
export function scoreDeployment(
  spec: LiveDeploymentSpec,
  pods: LivePodStatus[],
  metrics: DeploymentMetrics,
): HealthScoreResult {
  const factors: HealthScoreFactor[] = [];
  let score = 100;

  const deduct = (category: string, deduction: number, reason: string) => {
    if (deduction <= 0) return;
    score -= deduction;
    factors.push({ category, deduction, reason });
  };

  // Availability — the single biggest signal. Fully down (0 available) is
  // worse than "1 of 3 replicas missing", scaled linearly.
  if (spec.desiredReplicas > 0) {
    const missingFraction =
      (spec.desiredReplicas - spec.availableReplicas) / spec.desiredReplicas;
    if (missingFraction > 0) {
      deduct(
        'availability',
        Math.round(45 * missingFraction),
        `${spec.availableReplicas}/${spec.desiredReplicas} replicas available`,
      );
    }
  }

  // Pod-level failure reasons — CrashLoopBackOff etc. are a stronger, more
  // specific signal than the raw availability gap above, so they stack on
  // top rather than replace it (a crash-looping pod IS an unavailable one,
  // but knowing *why* matters for the score to be explainable).
  const worstBadReason = pods
    .map((p) => p.badReason)
    .filter((r): r is string => !!r)
    .sort((a, b) => (BAD_REASON_DEDUCTIONS[b] ?? 15) - (BAD_REASON_DEDUCTIONS[a] ?? 15))[0];
  if (worstBadReason) {
    deduct(
      'pod-failure',
      BAD_REASON_DEDUCTIONS[worstBadReason] ?? 15,
      `Pod(s) in ${worstBadReason}`,
    );
  }

  // Restarts — even a healthy-looking pod that has restarted repeatedly
  // indicates instability worth surfacing, capped so it can't alone sink
  // the score the way an active crash loop does.
  if (metrics.restarts > 0) {
    deduct(
      'stability',
      Math.min(15, metrics.restarts * 3),
      `${metrics.restarts} container restart(s) recorded`,
    );
  }

  // Resource pressure — usage approaching the configured limit risks
  // throttling (CPU) or an OOM kill (memory) soon, even though nothing has
  // failed yet.
  if (spec.resources) {
    const cpuLimit = parseCpuQuantity(spec.resources.limits.cpu);
    const memLimit = parseMemoryQuantity(spec.resources.limits.memory);
    if (cpuLimit && metrics.cpuCores / cpuLimit > 0.9) {
      deduct(
        'resource-pressure',
        10,
        `CPU usage at ${Math.round((metrics.cpuCores / cpuLimit) * 100)}% of limit`,
      );
    }
    if (memLimit && metrics.memoryBytes / memLimit > 0.9) {
      deduct(
        'resource-pressure',
        10,
        `Memory usage at ${Math.round((metrics.memoryBytes / memLimit) * 100)}% of limit`,
      );
    }
  } else {
    deduct('best-practice', 8, 'No resource requests/limits configured');
  }

  // Best-practice hygiene — doesn't indicate an active problem, but each is
  // a real gap versus how this platform's own manifests.ts generates
  // Deployments, so a drift from that (or a deployment predating a probe)
  // is worth flagging.
  if (!spec.hasReadinessProbe || !spec.hasLivenessProbe) {
    deduct('best-practice', 6, 'Missing readiness and/or liveness probe');
  }
  if (!spec.hasHpa) {
    deduct('best-practice', 4, 'No HorizontalPodAutoscaler configured');
  }

  const finalScore = clamp(score);
  return { score: finalScore, label: labelFor(finalScore), factors, metrics };
}

export async function computeHealthScore(
  namespace: string,
  appName: string,
): Promise<HealthScoreResult> {
  const [spec, pods, metrics] = await Promise.all([
    getLiveDeploymentSpec(namespace, appName),
    getLivePods(namespace, appName),
    getSnapshot(namespace),
  ]);

  return scoreDeployment(spec, pods, metrics);
}

export { LiveResourceNotFoundError };
