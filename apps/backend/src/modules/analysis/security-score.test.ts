import { describe, expect, it } from 'vitest';
import { scoreSecurity } from './security-score.js';
import type { LiveDeploymentSpec } from '../kubernetes/inspect.js';

// Matches exactly what modules/kubernetes/manifests.ts currently generates —
// no securityContext, no hostPath, image pinned to a commit SHA. Used to
// confirm the scanner correctly flags the platform's own current gaps
// (no securityContext hardening, no NetworkPolicy) without false-flagging
// things it does do right (resources, probes, HPA, image pinning).
const currentPlatformSpec: LiveDeploymentSpec = {
  image: 'deployiq/app:4128de64f9a5b48910ffc10b26c98928cd47bffe',
  imageTag: '4128de64f9a5b48910ffc10b26c98928cd47bffe',
  desiredReplicas: 1,
  availableReplicas: 1,
  resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '500m', memory: '512Mi' } },
  hasReadinessProbe: true,
  hasLivenessProbe: true,
  hasHpa: true,
  hasPdb: false,
  securityContext: {
    runAsNonRoot: null,
    privileged: null,
    allowPrivilegeEscalation: null,
    readOnlyRootFilesystem: null,
  },
  hasHostPathVolume: false,
};

const hardenedSpec: LiveDeploymentSpec = {
  ...currentPlatformSpec,
  securityContext: {
    runAsNonRoot: true,
    privileged: false,
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
  },
};

describe('scoreSecurity', () => {
  it('flags the platform default manifest for missing securityContext and NetworkPolicy, not for what it does right', () => {
    const result = scoreSecurity(currentPlatformSpec, 'ClusterIP', false);
    const ids = result.findings.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'runs-as-root',
        'privilege-escalation-allowed',
        'writable-root-filesystem',
        'no-network-policy',
      ]),
    );
    expect(ids).not.toContain('unpinned-image-tag');
    expect(ids).not.toContain('no-resource-limits');
    expect(ids).not.toContain('missing-probes');
    expect(ids).not.toContain('hostpath-volume');
    expect(ids).not.toContain('privileged-container');
  });

  it('gives a fully hardened deployment with ClusterIP + NetworkPolicy a perfect A', () => {
    const result = scoreSecurity(hardenedSpec, 'ClusterIP', true);
    expect(result.findings).toHaveLength(0);
    expect(result.score).toBe(100);
    expect(result.grade).toBe('A');
  });

  it('scores a privileged container with a hostPath mount as an F', () => {
    const spec: LiveDeploymentSpec = {
      ...currentPlatformSpec,
      securityContext: { ...currentPlatformSpec.securityContext, privileged: true },
      hasHostPathVolume: true,
    };
    const result = scoreSecurity(spec, 'LoadBalancer', false);
    expect(result.grade).toBe('F');
    expect(result.findings.map((f) => f.id)).toEqual(
      expect.arrayContaining(['privileged-container', 'hostpath-volume', 'publicly-exposed-service']),
    );
  });

  it('flags an untagged/latest image', () => {
    const spec: LiveDeploymentSpec = { ...hardenedSpec, imageTag: 'latest' };
    const result = scoreSecurity(spec, 'ClusterIP', true);
    expect(result.findings.some((f) => f.id === 'unpinned-image-tag')).toBe(true);
  });

  it('never returns a score below 0', () => {
    const spec: LiveDeploymentSpec = {
      ...currentPlatformSpec,
      resources: null,
      hasReadinessProbe: false,
      hasLivenessProbe: false,
      hasHostPathVolume: true,
      imageTag: null,
      securityContext: {
        runAsNonRoot: false,
        privileged: true,
        allowPrivilegeEscalation: true,
        readOnlyRootFilesystem: false,
      },
    };
    const result = scoreSecurity(spec, 'NodePort', false);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.grade).toBe('F');
  });
});
