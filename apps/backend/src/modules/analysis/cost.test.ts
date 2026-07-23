import { describe, expect, it } from 'vitest';
import {
  computeCost,
  CPU_RATE_PER_CORE_HOUR,
  HOURS_PER_MONTH,
  MEMORY_RATE_PER_GB_HOUR,
} from './cost.js';
import type { LiveDeploymentSpec } from '../kubernetes/inspect.js';

const spec: LiveDeploymentSpec = {
  image: 'app:sha',
  imageTag: 'sha',
  desiredReplicas: 2,
  availableReplicas: 2,
  resources: {
    requests: { cpu: '100m', memory: '128Mi' },
    limits: { cpu: '500m', memory: '512Mi' },
  },
  hasReadinessProbe: true,
  hasLivenessProbe: true,
  hasHpa: true,
  hasPdb: true,
  securityContext: {
    runAsNonRoot: true,
    privileged: false,
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
  },
  hasHostPathVolume: false,
};

const idleMetrics = {
  podCount: 2,
  desiredReplicas: 2,
  availableReplicas: 2,
  cpuCores: 0.001, // essentially idle
  memoryBytes: 20 * 1024 * 1024,
  restarts: 0,
};

describe('computeCost', () => {
  it('multiplies requested resources by replicas and hours/month', () => {
    const result = computeCost(spec, idleMetrics);
    const expectedCpuCost = 0.1 * CPU_RATE_PER_CORE_HOUR * 2 * HOURS_PER_MONTH;
    const expectedMemCost = (128 / 1024) * MEMORY_RATE_PER_GB_HOUR * 2 * HOURS_PER_MONTH;
    expect(result.monthlyCpuCost).toBeCloseTo(expectedCpuCost, 5);
    expect(result.monthlyMemoryCost).toBeCloseTo(expectedMemCost, 5);
    expect(result.monthlyCost).toBeCloseTo(expectedCpuCost + expectedMemCost, 5);
    expect(result.replicas).toBe(2);
  });

  it('flags savings when a deployment is heavily over-requested relative to actual usage', () => {
    const result = computeCost(spec, idleMetrics);
    expect(result.optimizedMonthlyCost).toBeLessThan(result.monthlyCost);
    expect(result.potentialMonthlySavings).toBeGreaterThan(0);
  });

  it('never reports negative savings for a tightly-sized deployment', () => {
    const tightMetrics = { ...idleMetrics, cpuCores: 0.095, memoryBytes: 120 * 1024 * 1024 };
    const result = computeCost(spec, tightMetrics);
    expect(result.potentialMonthlySavings).toBeGreaterThanOrEqual(0);
  });

  it('falls back to actual usage when no resources are configured, instead of costing $0', () => {
    const unconfigured: LiveDeploymentSpec = { ...spec, resources: null, desiredReplicas: 1 };
    const metrics = {
      ...idleMetrics,
      cpuCores: 0.05,
      memoryBytes: 64 * 1024 * 1024,
      desiredReplicas: 1,
    };
    const result = computeCost(unconfigured, metrics);
    expect(result.monthlyCost).toBeGreaterThan(0);
    expect(result.requestedCpuCores).toBeCloseTo(0.05, 5);
  });

  it('treats desiredReplicas of 0 as at least 1 for cost purposes', () => {
    const scaledDown: LiveDeploymentSpec = { ...spec, desiredReplicas: 0 };
    const result = computeCost(scaledDown, idleMetrics);
    expect(result.replicas).toBe(1);
  });
});
