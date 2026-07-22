import { logger } from '../../common/logger.js';
import { AiNotConfiguredError, recommend, type Recommendation } from '../ai/client.js';
import { getLiveDeploymentSpec, getLivePods } from '../kubernetes/inspect.js';
import { getSnapshot } from '../monitoring/metrics.js';
import { parseCpuQuantity, parseMemoryQuantity } from './health-score.js';

export interface RecommendationsResult {
  recommendations: Recommendation[];
  aiConfigured: boolean;
}

function formatCores(cores: number): string {
  return `${Math.round(cores * 1000)}m`;
}

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}Mi`;
}

function buildSummary(
  spec: Awaited<ReturnType<typeof getLiveDeploymentSpec>>,
  pods: Awaited<ReturnType<typeof getLivePods>>,
  metrics: Awaited<ReturnType<typeof getSnapshot>>,
): string {
  const cpuRequest = parseCpuQuantity(spec.resources?.requests.cpu ?? null);
  const cpuLimit = parseCpuQuantity(spec.resources?.limits.cpu ?? null);
  const memRequest = parseMemoryQuantity(spec.resources?.requests.memory ?? null);
  const memLimit = parseMemoryQuantity(spec.resources?.limits.memory ?? null);

  const lines = [
    `Replicas: ${spec.availableReplicas}/${spec.desiredReplicas} available.`,
    spec.resources
      ? `CPU: requested ${spec.resources.requests.cpu ?? 'none'}, limit ${spec.resources.limits.cpu ?? 'none'}, actual usage ${formatCores(metrics.cpuCores)}` +
        (cpuRequest ? ` (${Math.round((metrics.cpuCores / cpuRequest) * 100)}% of request)` : '') +
        (cpuLimit ? `, ${Math.round((metrics.cpuCores / cpuLimit) * 100)}% of limit.` : '.')
      : 'CPU: no requests/limits configured.',
    spec.resources
      ? `Memory: requested ${spec.resources.requests.memory ?? 'none'}, limit ${spec.resources.limits.memory ?? 'none'}, actual usage ${formatBytes(metrics.memoryBytes)}` +
        (memRequest ? ` (${Math.round((metrics.memoryBytes / memRequest) * 100)}% of request)` : '') +
        (memLimit ? `, ${Math.round((metrics.memoryBytes / memLimit) * 100)}% of limit.` : '.')
      : 'Memory: no requests/limits configured.',
    `Readiness probe: ${spec.hasReadinessProbe ? 'configured' : 'MISSING'}.`,
    `Liveness probe: ${spec.hasLivenessProbe ? 'configured' : 'MISSING'}.`,
    `HorizontalPodAutoscaler: ${spec.hasHpa ? 'configured' : 'not configured'}.`,
    `PodDisruptionBudget: ${spec.hasPdb ? 'configured' : 'not configured'}.`,
    `Restarts (last window): ${metrics.restarts}.`,
    `Pod statuses: ${pods.map((p) => `${p.name}=${p.badReason ?? p.phase}`).join(', ') || 'none'}.`,
  ];

  return lines.join('\n');
}

export async function generateRecommendations(
  namespace: string,
  appName: string,
): Promise<RecommendationsResult> {
  const [spec, pods, metrics] = await Promise.all([
    getLiveDeploymentSpec(namespace, appName),
    getLivePods(namespace, appName),
    getSnapshot(namespace),
  ]);

  const summary = buildSummary(spec, pods, metrics);

  try {
    const { recommendations } = await recommend({ summary });
    return { recommendations, aiConfigured: true };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      logger.info('Skipping AI recommendations — no ANTHROPIC_API_KEY configured', { namespace });
      return { recommendations: [], aiConfigured: false };
    }
    throw err;
  }
}
