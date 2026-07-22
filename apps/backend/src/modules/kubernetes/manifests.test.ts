import { describe, expect, it } from 'vitest';
import {
  buildDeployment,
  buildHpa,
  buildIngress,
  buildNamespace,
  buildService,
} from './manifests.js';
import type { ManifestInput } from './manifests.js';

const input: ManifestInput = {
  namespace: 'deploy-a1b2c3d4',
  appName: 'app',
  image: 'deployiq/moksha3110-calculator-devops:abc123',
  containerPort: 5000,
  imagePullPolicy: 'Never',
  ingressHost: 'deploy-a1b2c3d4.platform.local',
};

describe('buildNamespace', () => {
  it('names the namespace exactly as given', () => {
    expect(buildNamespace(input).metadata?.name).toBe('deploy-a1b2c3d4');
  });
});

describe('buildDeployment', () => {
  const deployment = buildDeployment(input);
  const container = deployment.spec?.template.spec?.containers[0];

  it('uses the given image and pull policy', () => {
    expect(container?.image).toBe(input.image);
    expect(container?.imagePullPolicy).toBe('Never');
  });

  it('exposes the detected container port on the container, and both probes', () => {
    expect(container?.ports?.[0]?.containerPort).toBe(5000);
    expect(container?.readinessProbe?.tcpSocket?.port).toBe(5000);
    expect(container?.livenessProbe?.tcpSocket?.port).toBe(5000);
  });

  it('sets resource requests/limits (never unbounded)', () => {
    expect(container?.resources?.requests).toEqual({ cpu: '100m', memory: '128Mi' });
    expect(container?.resources?.limits).toEqual({ cpu: '500m', memory: '512Mi' });
  });

  it('matches the pod template labels to the selector', () => {
    expect(deployment.spec?.selector.matchLabels).toEqual(
      deployment.spec?.template.metadata?.labels,
    );
  });
});

describe('buildService', () => {
  it('always listens on port 80 and forwards to the container port', () => {
    const service = buildService(input);
    expect(service.spec?.ports?.[0]).toEqual({ port: 80, targetPort: 5000 });
  });

  it('selects pods by the same app label the Deployment sets', () => {
    const service = buildService(input);
    const deployment = buildDeployment(input);
    expect(service.spec?.selector).toEqual(deployment.spec?.template.metadata?.labels);
  });
});

describe('buildIngress', () => {
  it('routes the given host to the Service on port 80', () => {
    const ingress = buildIngress(input);
    const rule = ingress.spec?.rules?.[0];
    expect(rule?.host).toBe(input.ingressHost);
    expect(rule?.http?.paths[0]?.backend.service?.port?.number).toBe(80);
  });
});

describe('buildHpa', () => {
  it('targets the Deployment by name and scales on CPU utilization', () => {
    const hpa = buildHpa(input);
    expect(hpa.spec?.scaleTargetRef).toEqual({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      name: 'app',
    });
    expect(hpa.spec?.minReplicas).toBeLessThanOrEqual(hpa.spec?.maxReplicas ?? 0);
  });
});
