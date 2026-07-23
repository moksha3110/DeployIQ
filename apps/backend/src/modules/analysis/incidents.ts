import type { IncidentPriority, IncidentType } from '@prisma/client';
import { logger } from '../../common/logger.js';
import { prisma } from '../../prisma/client.js';
import { AiNotConfiguredError, diagnoseIncident } from '../ai/client.js';
import type { LiveEvent, LivePodStatus } from '../kubernetes/inspect.js';
import { getLivePods, getRecentEvents } from '../kubernetes/inspect.js';

// Deterministic fallback used when no ANTHROPIC_API_KEY is configured —
// incident *detection* (the classification below) works without AI at all;
// only the narrative root cause and the priority call get a lower-quality
// default instead of blocking incident creation entirely.
const DEFAULT_DIAGNOSIS: Record<
  IncidentType,
  { rootCause: string; recommendedAction: string; priority: IncidentPriority }
> = {
  CRASH_LOOP_BACKOFF: {
    rootCause: 'The container is repeatedly crashing shortly after start.',
    recommendedAction: 'Check container logs with `kubectl logs <pod> --previous`.',
    priority: 'HIGH',
  },
  IMAGE_PULL_ERROR: {
    rootCause: 'The node could not pull the container image.',
    recommendedAction: 'Verify the image tag exists and registry credentials are correct.',
    priority: 'HIGH',
  },
  OOM_KILLED: {
    rootCause: 'The container exceeded its memory limit and was killed.',
    recommendedAction: 'Raise the memory limit or investigate a possible memory leak.',
    priority: 'HIGH',
  },
  PENDING_UNSCHEDULABLE: {
    rootCause: 'The pod cannot be scheduled onto any node.',
    recommendedAction:
      'Check node resource capacity and any scheduling constraints (taints, affinity).',
    priority: 'MEDIUM',
  },
  OTHER: {
    rootCause: 'The pod is in an unhealthy state.',
    recommendedAction: 'Inspect pod status and events with `kubectl describe pod`.',
    priority: 'MEDIUM',
  },
};

// Pure, so it's testable without a live cluster (see incidents.test.ts).
export function classifyPod(pod: LivePodStatus): IncidentType | null {
  switch (pod.badReason) {
    case 'CrashLoopBackOff':
      return 'CRASH_LOOP_BACKOFF';
    case 'ImagePullBackOff':
    case 'ErrImagePull':
      return 'IMAGE_PULL_ERROR';
    case 'OOMKilled':
      return 'OOM_KILLED';
    case null:
      return pod.phase === 'Pending' ? 'PENDING_UNSCHEDULABLE' : null;
    default:
      return 'OTHER';
  }
}

function buildSummary(type: IncidentType, pods: LivePodStatus[], events: LiveEvent[]): string {
  const podLines = pods.map(
    (p) =>
      `${p.name}: phase=${p.phase}, ready=${p.ready}, restarts=${p.restartCount}, reason=${p.badReason ?? 'none'}`,
  );
  const eventLines = events
    .filter((e) => e.type !== 'Normal')
    .slice(0, 10)
    .map((e) => `[${e.reason}] ${e.involvedObject}: ${e.message} (x${e.count})`);

  return [
    `Detected incident type: ${type}`,
    `Pod statuses:`,
    ...podLines,
    `Recent warning events:`,
    ...(eventLines.length > 0 ? eventLines : ['none']),
  ].join('\n');
}

async function diagnose(
  type: IncidentType,
  pods: LivePodStatus[],
  events: LiveEvent[],
): Promise<{ rootCause: string; recommendedAction: string; priority: IncidentPriority }> {
  try {
    const summary = buildSummary(type, pods, events);
    const result = await diagnoseIncident({ summary });
    return {
      rootCause: result.rootCause,
      recommendedAction: result.recommendedAction,
      priority: result.priority.toUpperCase() as IncidentPriority,
    };
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return DEFAULT_DIAGNOSIS[type];
    logger.error('incident AI diagnosis failed, using default', { type, err });
    return DEFAULT_DIAGNOSIS[type];
  }
}

// Opens/bumps an Incident row per distinct problem type currently observed,
// and auto-resolves previously-open incidents whose triggering condition
// has cleared. Called both on the 5-minute snapshot cadence (so incidents
// get created even with no one watching the dashboard) and synchronously
// from the GET /incidents route (so a page view always reflects current
// state, not up-to-5-minutes-stale state).
export async function scanIncidents(
  deploymentId: string,
  namespace: string,
  appName: string,
): Promise<void> {
  const [pods, events] = await Promise.all([
    getLivePods(namespace, appName),
    getRecentEvents(namespace),
  ]);

  const detectedTypes = new Set(pods.map(classifyPod).filter((t): t is IncidentType => t !== null));

  for (const type of detectedTypes) {
    const existingOpen = await prisma.incident.findFirst({
      where: { deploymentId, type, status: 'OPEN' },
    });

    if (existingOpen) {
      await prisma.incident.update({
        where: { id: existingOpen.id },
        data: { lastSeenAt: new Date(), occurrenceCount: { increment: 1 } },
      });
      continue;
    }

    const diagnosis = await diagnose(type, pods, events);
    await prisma.incident.create({
      data: {
        deploymentId,
        type,
        priority: diagnosis.priority,
        rootCause: diagnosis.rootCause,
        recommendedAction: diagnosis.recommendedAction,
      },
    });
  }

  const openIncidents = await prisma.incident.findMany({
    where: { deploymentId, status: 'OPEN' },
  });
  for (const incident of openIncidents) {
    if (!detectedTypes.has(incident.type)) {
      await prisma.incident.update({
        where: { id: incident.id },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
    }
  }
}
