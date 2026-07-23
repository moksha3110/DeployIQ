import type { Anthropic } from '@anthropic-ai/sdk';
import { prisma } from '../../prisma/client.js';
import { answerQuery, type AgenticTool } from '../ai/client.js';
import { computeHealthScore } from './health-score.js';
import { computeSecurityScore } from './security-score.js';
import { computeCostForDeployment } from './cost.js';
import { scanIncidents } from './incidents.js';
import { buildTopology } from './topology.js';

const NO_ARGS_SCHEMA: Anthropic.Tool['input_schema'] = { type: 'object', properties: {} };

export interface DeploymentQueryContext {
  deploymentId: string;
  namespace: string;
  appName: string;
  repositoryFullName: string;
  branch: string;
  commitSha: string;
}

function buildTools(ctx: DeploymentQueryContext): AgenticTool[] {
  return [
    {
      definition: {
        name: 'get_health_score',
        description:
          'Get the current 0-100 health score for this deployment, with a breakdown of exactly what is deducting points (availability, crash loops, restarts, resource pressure, missing best practices).',
        input_schema: NO_ARGS_SCHEMA,
      },
      execute: () => computeHealthScore(ctx.namespace, ctx.appName),
    },
    {
      definition: {
        name: 'get_security_findings',
        description:
          'Get the current security scan findings for this deployment (root containers, privileged mode, unpinned images, missing NetworkPolicy, etc.) with an A-F grade.',
        input_schema: NO_ARGS_SCHEMA,
      },
      execute: () => computeSecurityScore(ctx.namespace, ctx.appName),
    },
    {
      definition: {
        name: 'get_cost_breakdown',
        description:
          'Get the estimated monthly cost of this deployment based on its resource requests and replica count, plus what it would cost if right-sized to actual usage.',
        input_schema: NO_ARGS_SCHEMA,
      },
      execute: () => computeCostForDeployment(ctx.namespace, ctx.appName),
    },
    {
      definition: {
        name: 'get_incidents',
        description:
          'Get open and recently resolved incidents for this deployment (CrashLoopBackOff, OOMKilled, ImagePullBackOff, unschedulable pods), each with a root cause and recommended action.',
        input_schema: NO_ARGS_SCHEMA,
      },
      execute: async () => {
        await scanIncidents(ctx.deploymentId, ctx.namespace, ctx.appName);
        return prisma.incident.findMany({
          where: { deploymentId: ctx.deploymentId },
          orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }],
          take: 20,
        });
      },
    },
    {
      definition: {
        name: 'get_topology',
        description:
          'Get the live infrastructure topology for this deployment — every node from the GitHub repo down through the cluster/namespace/Deployment/pods/Service/Ingress/ConfigMaps/Secrets, with status for each.',
        input_schema: NO_ARGS_SCHEMA,
      },
      execute: () =>
        buildTopology(
          ctx.namespace,
          ctx.appName,
          ctx.repositoryFullName,
          ctx.branch,
          ctx.commitSha,
        ),
    },
  ];
}

export async function queryDeployment(
  ctx: DeploymentQueryContext,
  question: string,
): Promise<string> {
  return answerQuery(question, buildTools(ctx));
}
