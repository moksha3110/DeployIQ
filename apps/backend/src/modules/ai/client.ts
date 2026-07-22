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
