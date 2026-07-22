import { logger } from '../../common/logger.js';
import { prisma } from '../../prisma/client.js';
import { AiNotConfiguredError, diagnose } from './client.js';

const MAX_LOG_LINES = 150;

async function buildLogExcerpt(deploymentId: string): Promise<string> {
  const rows = await prisma.deploymentLog.findMany({
    where: { deploymentId },
    orderBy: { timestamp: 'asc' },
  });

  // The failure is almost always near the end — take the tail rather than
  // the head so a long, chatty `docker build` doesn't push the actual
  // error out of the window.
  const tail = rows.slice(-MAX_LOG_LINES);
  return tail.map((row) => `[${row.stage}/${row.level}] ${row.message}`).join('\n');
}

// Called from the build/deploy pipelines' failure paths. Deliberately never
// throws — a failure to *diagnose* a failure must not itself fail the
// deployment record update it's reacting to, and must not be treated as a
// pipeline bug when the real cause is just "no API key configured".
export async function analyzeFailure(deploymentId: string, stage: string): Promise<void> {
  try {
    const logExcerpt = await buildLogExcerpt(deploymentId);
    if (!logExcerpt) return;

    const { diagnosis, raw } = await diagnose({ stage, logExcerpt });

    await prisma.aIAnalysis.create({
      data: {
        deploymentId,
        rootCause: diagnosis.rootCause,
        suggestedFixes: diagnosis.suggestedFixes,
        likelyConfigIssue: diagnosis.likelyConfigIssue,
        confidence: diagnosis.confidence,
        rawModelResponse: raw as unknown as object,
      },
    });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      logger.info('Skipping AI analysis — no ANTHROPIC_API_KEY configured', { deploymentId });
      return;
    }
    logger.error('AI analysis failed', { deploymentId, err });
  }
}
