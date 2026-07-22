import { describe, expect, it } from 'vitest';
import { parseCpuQuantity, parseMemoryQuantity, scoreDeployment } from './health-score.js';
import type { LiveDeploymentSpec, LivePodStatus } from '../kubernetes/inspect.js';

const healthySpec: LiveDeploymentSpec = {
  image: 'app:sha',
  desiredReplicas: 1,
  availableReplicas: 1,
  resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '500m', memory: '512Mi' } },
  hasReadinessProbe: true,
  hasLivenessProbe: true,
  hasHpa: true,
  hasPdb: false,
};

const healthyPods: LivePodStatus[] = [
  { name: 'app-1', phase: 'Running', ready: true, restartCount: 0, badReason: null },
];

const healthyMetrics = {
  podCount: 1,
  desiredReplicas: 1,
  availableReplicas: 1,
  cpuCores: 0.01,
  memoryBytes: 50 * 1024 * 1024,
  restarts: 0,
};

describe('parseCpuQuantity', () => {
  it('parses millicores', () => expect(parseCpuQuantity('500m')).toBe(0.5));
  it('parses whole cores', () => expect(parseCpuQuantity('2')).toBe(2));
  it('returns null for null input', () => expect(parseCpuQuantity(null)).toBeNull());
});

describe('parseMemoryQuantity', () => {
  it('parses Mi', () => expect(parseMemoryQuantity('512Mi')).toBe(512 * 1024 * 1024));
  it('parses Gi', () => expect(parseMemoryQuantity('1Gi')).toBe(1024 ** 3));
});

describe('scoreDeployment', () => {
  it('scores a fully healthy deployment at 100/Excellent with no factors', () => {
    const result = scoreDeployment(healthySpec, healthyPods, healthyMetrics);
    expect(result.score).toBe(100);
    expect(result.label).toBe('Excellent');
    expect(result.factors).toHaveLength(0);
  });

  it('penalizes missing availability proportionally to how many replicas are down', () => {
    const spec = { ...healthySpec, desiredReplicas: 2, availableReplicas: 1 };
    const result = scoreDeployment(spec, healthyPods, { ...healthyMetrics, desiredReplicas: 2, availableReplicas: 1 });
    expect(result.score).toBeLessThan(100);
    expect(result.factors.some((f) => f.category === 'availability')).toBe(true);
  });

  it('scores a crash-looping deployment as Critical with the specific failure reason', () => {
    const spec = { ...healthySpec, availableReplicas: 0 };
    const pods: LivePodStatus[] = [
      { name: 'app-1', phase: 'Waiting', ready: false, restartCount: 12, badReason: 'CrashLoopBackOff' },
    ];
    const metrics = { ...healthyMetrics, availableReplicas: 0, restarts: 12 };
    const result = scoreDeployment(spec, pods, metrics);
    expect(result.label).toBe('Critical');
    expect(result.factors.map((f) => f.category)).toEqual(
      expect.arrayContaining(['availability', 'pod-failure', 'stability']),
    );
  });

  it('flags missing resource requests/limits as a best-practice gap', () => {
    const spec = { ...healthySpec, resources: null };
    const result = scoreDeployment(spec, healthyPods, healthyMetrics);
    expect(result.factors.some((f) => f.reason.includes('No resource requests/limits'))).toBe(true);
  });

  it('flags resource usage approaching its configured limit', () => {
    const metrics = { ...healthyMetrics, cpuCores: 0.48 }; // 96% of the 500m limit
    const result = scoreDeployment(healthySpec, healthyPods, metrics);
    expect(result.factors.some((f) => f.category === 'resource-pressure')).toBe(true);
  });

  it('never returns a score below 0 even with every deduction stacked', () => {
    const spec: LiveDeploymentSpec = {
      ...healthySpec,
      availableReplicas: 0,
      resources: null,
      hasReadinessProbe: false,
      hasLivenessProbe: false,
      hasHpa: false,
    };
    const pods: LivePodStatus[] = [
      { name: 'app-1', phase: 'Waiting', ready: false, restartCount: 99, badReason: 'CrashLoopBackOff' },
    ];
    const metrics = { ...healthyMetrics, availableReplicas: 0, restarts: 99 };
    const result = scoreDeployment(spec, pods, metrics);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.label).toBe('Critical');
  });
});
