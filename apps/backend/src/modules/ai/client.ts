import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';

export class AiNotConfiguredError extends Error {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AiNotConfiguredError('ANTHROPIC_API_KEY is not set');
  }
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

export interface Diagnosis {
  rootCause: string;
  suggestedFixes: string[];
  likelyConfigIssue: string | null;
  confidence: number;
}

const DIAGNOSIS_TOOL: Anthropic.Tool = {
  name: 'report_diagnosis',
  description: 'Report a structured diagnosis of why a deployment failed.',
  input_schema: {
    type: 'object',
    properties: {
      rootCause: {
        type: 'string',
        description: 'A concise (1-3 sentence) explanation of what actually went wrong.',
      },
      suggestedFixes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Concrete, actionable steps to fix the problem, most likely first.',
      },
      likelyConfigIssue: {
        type: ['string', 'null'],
        description:
          'The specific file/setting most likely at fault (e.g. "Dockerfile EXPOSE port", "requirements.txt"), or null if this looks environmental rather than a config problem.',
      },
      confidence: {
        type: 'number',
        description:
          'Confidence in this diagnosis from 0 (guessing) to 1 (certain), given the evidence available.',
      },
    },
    required: ['rootCause', 'suggestedFixes', 'likelyConfigIssue', 'confidence'],
  },
};

const SYSTEM_PROMPT = `You are a DevOps assistant diagnosing why an automated container build/deploy pipeline failed. You are given the pipeline stage that failed and a log excerpt. Identify the real root cause (not just "the build failed"), suggest concrete fixes a developer could apply, note the specific file/setting most likely at fault if there is one, and give an honest confidence score — logs that are truncated or ambiguous should get a lower score, not a confident-sounding guess. Respond only by calling report_diagnosis.`;

export interface DiagnosisResult {
  diagnosis: Diagnosis;
  raw: Anthropic.Message;
}

export async function diagnose(context: {
  stage: string;
  logExcerpt: string;
}): Promise<DiagnosisResult> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [DIAGNOSIS_TOOL],
    tool_choice: { type: 'tool', name: 'report_diagnosis' },
    messages: [
      {
        role: 'user',
        content: `Stage: ${context.stage}\n\nLog excerpt:\n${context.logExcerpt}`,
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );
  if (!toolUse) {
    throw new Error('Model did not return a structured diagnosis');
  }

  return { diagnosis: toolUse.input as Diagnosis, raw: message };
}

export type RecommendationSeverity = 'low' | 'medium' | 'high';
export type RecommendationCategory =
  | 'resource-limits'
  | 'probes'
  | 'autoscaling'
  | 'availability'
  | 'other';

export interface Recommendation {
  category: RecommendationCategory;
  severity: RecommendationSeverity;
  problem: string;
  reason: string;
  impact: string;
  fix: string;
}

const RECOMMENDATIONS_TOOL: Anthropic.Tool = {
  name: 'report_recommendations',
  description:
    'Report a prioritized list of infrastructure recommendations for a running Kubernetes deployment.',
  input_schema: {
    type: 'object',
    properties: {
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['resource-limits', 'probes', 'autoscaling', 'availability', 'other'],
            },
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
            problem: { type: 'string', description: 'One sentence: what is wrong or suboptimal.' },
            reason: {
              type: 'string',
              description: 'Why this matters, grounded in the specific numbers given.',
            },
            impact: {
              type: 'string',
              description: 'What happens if this is left as-is (cost, reliability, or performance).',
            },
            fix: {
              type: 'string',
              description:
                'A concrete, actionable fix — a specific value to set or YAML/config snippet, not a vague suggestion.',
            },
          },
          required: ['category', 'severity', 'problem', 'reason', 'impact', 'fix'],
        },
      },
    },
    required: ['recommendations'],
  },
};

const RECOMMENDATIONS_SYSTEM_PROMPT = `You are a Kubernetes infrastructure advisor reviewing one running deployment. You are given its configured resource requests/limits, actual observed CPU/memory usage, replica/probe/autoscaler/disruption-budget configuration, and recent restart count. Recommend concrete improvements — right-sizing over- or under-provisioned resources, adding missing probes or a HorizontalPodAutoscaler or PodDisruptionBudget where the data justifies it, addressing instability. Ground every recommendation in the actual numbers given; do not invent issues the data doesn't support, and return an empty list if the deployment already looks well-configured. Respond only by calling report_recommendations.`;

export interface RecommendationsResult {
  recommendations: Recommendation[];
  raw: Anthropic.Message;
}

export async function recommend(context: { summary: string }): Promise<RecommendationsResult> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1536,
    system: RECOMMENDATIONS_SYSTEM_PROMPT,
    tools: [RECOMMENDATIONS_TOOL],
    tool_choice: { type: 'tool', name: 'report_recommendations' },
    messages: [{ role: 'user', content: context.summary }],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );
  if (!toolUse) {
    throw new Error('Model did not return structured recommendations');
  }

  const input = toolUse.input as { recommendations: Recommendation[] };
  return { recommendations: input.recommendations, raw: message };
}
