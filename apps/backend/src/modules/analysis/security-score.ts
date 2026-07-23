import type { LiveDeploymentSpec } from '../kubernetes/inspect.js';
import { getLiveDeploymentSpec, getServiceType, hasNetworkPolicy } from '../kubernetes/inspect.js';

export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low';

export interface SecurityFinding {
  id: string;
  severity: SecuritySeverity;
  title: string;
  description: string;
  fix: string;
}

export type SecurityGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface SecurityScoreResult {
  score: number;
  grade: SecurityGrade;
  findings: SecurityFinding[];
}

const SEVERITY_DEDUCTIONS: Record<SecuritySeverity, number> = {
  critical: 40,
  high: 22,
  medium: 12,
  low: 5,
};

function clamp(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function gradeFor(score: number): SecurityGrade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 50) return 'C';
  if (score >= 25) return 'D';
  return 'F';
}

// Pure — takes already-fetched live state so it's testable against fixed
// inputs (see security-score.test.ts) without a live cluster.
export function scoreSecurity(
  spec: LiveDeploymentSpec,
  serviceType: string | null,
  networkPolicyPresent: boolean,
): SecurityScoreResult {
  const findings: SecurityFinding[] = [];

  const add = (finding: SecurityFinding) => findings.push(finding);

  if (spec.securityContext.privileged === true) {
    add({
      id: 'privileged-container',
      severity: 'critical',
      title: 'Container runs in privileged mode',
      description:
        'A privileged container has near-total access to the host — this is a container escape waiting to happen.',
      fix: 'securityContext:\n  privileged: false',
    });
  }

  if (spec.securityContext.runAsNonRoot !== true) {
    add({
      id: 'runs-as-root',
      severity: 'high',
      title: 'Container is not confirmed to run as a non-root user',
      description:
        'Without runAsNonRoot: true, the container may run as root (the image default for most base images), so a container breakout gives root on the host filesystem view.',
      fix: 'securityContext:\n  runAsNonRoot: true\n  runAsUser: 1000',
    });
  }

  if (spec.securityContext.allowPrivilegeEscalation !== false) {
    add({
      id: 'privilege-escalation-allowed',
      severity: 'medium',
      title: 'Privilege escalation is not explicitly disabled',
      description:
        'Without allowPrivilegeEscalation: false, a process in the container can gain more privileges than its parent (e.g. via a setuid binary).',
      fix: 'securityContext:\n  allowPrivilegeEscalation: false',
    });
  }

  if (spec.securityContext.readOnlyRootFilesystem !== true) {
    add({
      id: 'writable-root-filesystem',
      severity: 'low',
      title: 'Root filesystem is writable',
      description:
        'A writable root filesystem lets an attacker who gains code execution persist tools or modify the running application; most apps only need specific volumes writable.',
      fix: 'securityContext:\n  readOnlyRootFilesystem: true',
    });
  }

  if (spec.hasHostPathVolume) {
    add({
      id: 'hostpath-volume',
      severity: 'high',
      title: 'Pod mounts a hostPath volume',
      description:
        'hostPath volumes expose the node filesystem to the container, breaking the isolation between pods on the same node.',
      fix: 'Replace the hostPath volume with a PersistentVolumeClaim, ConfigMap, or Secret, depending on what it holds.',
    });
  }

  if (spec.imageTag === 'latest' || spec.imageTag === null) {
    add({
      id: 'unpinned-image-tag',
      severity: 'medium',
      title:
        spec.imageTag === null
          ? 'Image has no tag (defaults to :latest)'
          : 'Image is tagged :latest',
      description:
        'An unpinned image tag means the exact code running is not reproducible and can change silently on the next pod restart/reschedule.',
      fix: 'Tag images with an immutable reference (commit SHA or content digest), e.g. myapp@sha256:...',
    });
  }

  if (!spec.resources) {
    add({
      id: 'no-resource-limits',
      severity: 'low',
      title: 'No resource requests/limits configured',
      description:
        'Without limits, a single misbehaving or compromised pod can exhaust node CPU/memory and degrade every other workload on that node.',
      fix: 'resources:\n  requests:\n    cpu: 100m\n    memory: 128Mi\n  limits:\n    cpu: 500m\n    memory: 512Mi',
    });
  }

  if (!spec.hasReadinessProbe || !spec.hasLivenessProbe) {
    add({
      id: 'missing-probes',
      severity: 'low',
      title: 'Missing readiness and/or liveness probe',
      description:
        'Without a liveness probe, a hung (but not crashed) process — including one wedged by an attacker — keeps receiving traffic indefinitely instead of being restarted.',
      fix: 'readinessProbe:\n  tcpSocket:\n    port: <container-port>\nlivenessProbe:\n  tcpSocket:\n    port: <container-port>',
    });
  }

  if (serviceType === 'LoadBalancer' || serviceType === 'NodePort') {
    add({
      id: 'publicly-exposed-service',
      severity: 'medium',
      title: `Service is directly exposed via ${serviceType}`,
      description:
        'Exposing a Service directly (rather than through an Ingress with TLS/host routing) skips a layer where access controls are normally centralized.',
      fix: 'Prefer type: ClusterIP with an Ingress in front for TLS termination and host-based routing.',
    });
  }

  if (!networkPolicyPresent) {
    add({
      id: 'no-network-policy',
      severity: 'medium',
      title: 'No NetworkPolicy in this namespace',
      description:
        'Without a NetworkPolicy, every pod in the namespace can be reached by every other pod in the cluster (subject to the CNI) — no east-west traffic restriction.',
      fix: 'apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: default-deny-ingress\nspec:\n  podSelector: {}\n  policyTypes: [Ingress]',
    });
  }

  const score = clamp(100 - findings.reduce((sum, f) => sum + SEVERITY_DEDUCTIONS[f.severity], 0));

  return { score, grade: gradeFor(score), findings };
}

export async function computeSecurityScore(
  namespace: string,
  appName: string,
): Promise<SecurityScoreResult> {
  const [spec, serviceType, networkPolicyPresent] = await Promise.all([
    getLiveDeploymentSpec(namespace, appName),
    getServiceType(namespace, appName),
    hasNetworkPolicy(namespace),
  ]);

  return scoreSecurity(spec, serviceType, networkPolicyPresent);
}
