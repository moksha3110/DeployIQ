import type {
  DeploymentMetrics,
  DeploymentMetricsHistory,
  MetricsRange,
} from '@platform/shared-types';
import { queryInstant, queryRange, type RangeSample } from './prometheus-client.js';

const APP_NAME = 'app'; // matches modules/kubernetes/pipeline.ts

// The community-standard filter for this is `container!="", container!="POD"`
// (drop the pod-level aggregate, keep only the real per-container series).
// That assumes cAdvisor actually emits per-container breakdown alongside the
// pod-level one — verified against a real Minikube cluster (Docker driver,
// Windows) that it does NOT: single-container pods here only get the
// pod-level aggregate (empty `container` label), so the standard filter
// silently returned zero for everything. Since every pod we deploy has
// exactly one container, the pod-level aggregate already *is* that
// container's usage — just excluding the pause container is correct here.
// Known tradeoff if this ever runs against a cluster whose cAdvisor does
// emit full per-container breakdown: this would double-count. Worth
// revisiting then, not before.
const CONTAINER_FILTER = 'container!="POD"';

export async function getSnapshot(namespace: string): Promise<DeploymentMetrics> {
  const [podCount, desiredReplicas, availableReplicas, cpuCores, memoryBytes, restarts] =
    await Promise.all([
      queryInstant(`count(kube_pod_status_phase{namespace="${namespace}", phase="Running"})`),
      queryInstant(
        `kube_deployment_spec_replicas{namespace="${namespace}", deployment="${APP_NAME}"}`,
      ),
      queryInstant(
        `kube_deployment_status_replicas_available{namespace="${namespace}", deployment="${APP_NAME}"}`,
      ),
      queryInstant(
        `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}", ${CONTAINER_FILTER}}[5m]))`,
      ),
      queryInstant(
        `sum(container_memory_working_set_bytes{namespace="${namespace}", ${CONTAINER_FILTER}})`,
      ),
      queryInstant(`sum(kube_pod_container_status_restarts_total{namespace="${namespace}"})`),
    ]);

  return {
    podCount,
    desiredReplicas,
    availableReplicas,
    cpuCores,
    memoryBytes,
    restarts,
  };
}

const RANGE_SECONDS: Record<MetricsRange, number> = { '1h': 3600, '24h': 86400, '7d': 604800 };

function toSeries(samples: RangeSample[]): DeploymentMetricsHistory['cpu'] {
  return samples.map((s) => ({ timestamp: s.timestamp * 1000, value: s.value }));
}

export async function getHistory(
  namespace: string,
  range: MetricsRange,
): Promise<DeploymentMetricsHistory> {
  const seconds = RANGE_SECONDS[range];
  const end = Math.floor(Date.now() / 1000);
  const start = end - seconds;
  const step = Math.max(15, Math.floor(seconds / 120)); // ~120 points regardless of range

  const [cpu, memory] = await Promise.all([
    queryRange(
      `sum(rate(container_cpu_usage_seconds_total{namespace="${namespace}", ${CONTAINER_FILTER}}[5m]))`,
      start,
      end,
      step,
    ),
    queryRange(
      `sum(container_memory_working_set_bytes{namespace="${namespace}", ${CONTAINER_FILTER}})`,
      start,
      end,
      step,
    ),
  ]);

  return { cpu: toSeries(cpu), memory: toSeries(memory) };
}
