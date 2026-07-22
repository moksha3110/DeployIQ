import type { DeploymentStage, LogLevel } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { deploymentLogChannel, redisPublisher } from '../../queues/pubsub.js';

export interface LogLine {
  stage: DeploymentStage;
  level: LogLevel;
  message: string;
  timestamp: string;
}

export async function appendLog(
  deploymentId: string,
  stage: DeploymentStage,
  level: LogLevel,
  message: string,
): Promise<void> {
  const row = await prisma.deploymentLog.create({
    data: { deploymentId, stage, level, message },
  });

  const line: LogLine = {
    stage: row.stage,
    level: row.level,
    message: row.message,
    timestamp: row.timestamp.toISOString(),
  };
  await redisPublisher.publish(deploymentLogChannel(deploymentId), JSON.stringify(line));
}
