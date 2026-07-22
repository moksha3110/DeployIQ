import { type ChildProcess, spawn } from 'node:child_process';
import { findFreePort } from '../../common/free-port.js';

const PROMETHEUS_NAMESPACE = 'monitoring';
const PROMETHEUS_SERVICE = 'kube-prometheus-stack-prometheus';
const PROMETHEUS_SERVICE_PORT = 9090;

// Our backend runs on the host, outside the cluster. Minikube's Docker
// driver on Windows/Mac only publishes a fixed handful of ports from the
// node container (SSH, the Docker API, the K8s API server) — an arbitrary
// NodePort is *not* reachable via `minikube ip:port` the way it would be on
// a Linux VM driver. Same fix as the per-deployment public URLs: a
// long-lived `kubectl port-forward`, held open for the life of this
// process rather than one-shot per request.
let forwardProcess: ChildProcess | null = null;
let cachedBaseUrl: string | null = null;

async function getPrometheusBaseUrl(): Promise<string> {
  if (cachedBaseUrl && forwardProcess && !forwardProcess.killed) return cachedBaseUrl;

  const port = await findFreePort();
  const child = spawn(
    'kubectl',
    [
      'port-forward',
      '-n',
      PROMETHEUS_NAMESPACE,
      `svc/${PROMETHEUS_SERVICE}`,
      `${port}:${PROMETHEUS_SERVICE_PORT}`,
    ],
    { stdio: 'ignore' },
  );
  forwardProcess = child;
  child.on('exit', () => {
    forwardProcess = null;
    cachedBaseUrl = null;
  });

  await new Promise((resolve) => setTimeout(resolve, 1500));
  cachedBaseUrl = `http://localhost:${port}`;
  return cachedBaseUrl;
}

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
