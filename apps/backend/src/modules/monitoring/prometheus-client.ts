import { createClusterForward } from '../../common/cluster-forward.js';

const getPrometheusBaseUrl = createClusterForward(
  'monitoring',
  'kube-prometheus-stack-prometheus',
  9090,
);

export class PrometheusQueryError extends Error {}

interface PrometheusResponse<T> {
  status: 'success' | 'error';
  error?: string;
  data: T;
}

interface InstantResult {
  result: Array<{ value: [number, string] }>;
}

interface RangeResult {
  result: Array<{ values: Array<[number, string]> }>;
}

// Returns the first series' value as a number, or 0 if the query matched
// nothing — a metric with no data (e.g. no restarts yet) is a legitimate
// "0", not an error.
export async function queryInstant(promql: string): Promise<number> {
  const base = await getPrometheusBaseUrl();
  const url = `${base}/api/v1/query?query=${encodeURIComponent(promql)}`;
  const res = await fetch(url);
  const body = (await res.json()) as PrometheusResponse<InstantResult>;
  if (body.status !== 'success') {
    throw new PrometheusQueryError(body.error ?? 'Prometheus query failed');
  }
  const value = body.data.result[0]?.value[1];
  return value ? Number(value) : 0;
}

export interface RangeSample {
  timestamp: number;
  value: number;
}

export async function queryRange(
  promql: string,
  startSeconds: number,
  endSeconds: number,
  stepSeconds: number,
): Promise<RangeSample[]> {
  const base = await getPrometheusBaseUrl();
  const url =
    `${base}/api/v1/query_range?query=${encodeURIComponent(promql)}` +
    `&start=${startSeconds}&end=${endSeconds}&step=${stepSeconds}`;
  const res = await fetch(url);
  const body = (await res.json()) as PrometheusResponse<RangeResult>;
  if (body.status !== 'success') {
    throw new PrometheusQueryError(body.error ?? 'Prometheus range query failed');
  }
  const series = body.data.result[0]?.values ?? [];
  return series.map(([timestamp, value]) => ({ timestamp, value: Number(value) }));
}
