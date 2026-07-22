import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { decrypt } from '../../common/crypto.js';
import { logger } from '../../common/logger.js';
import { appendLog } from '../deployments/log.js';
import { prisma } from '../../prisma/client.js';
import { enqueueDeployJob } from '../../queues/deploy-queue.js';
import { detectProjectType, UnsupportedProjectError } from './detect.js';
import { generateDockerfile } from './dockerfile-templates.js';
import { buildImage } from './docker.js';
import { cloneRepository, GitCloneError } from './git.js';
import { getRegistry } from './registry.js';

function slugify(fullName: string): string {
  return fullName.toLowerCase().replaceAll('/', '-');
}

const DEFAULT_PORT = 3000;

// For our own generated Dockerfiles we already know the port (see
// dockerfile-templates.ts). For a repo that ships its own Dockerfile, the
// only reliable source is its EXPOSE directive — fall back to the default
// if it doesn't have one, since a missing EXPOSE isn't actually an error
// (Docker doesn't require it).
function detectContainerPort(dockerfileContent: string, projectType: string): number {
  if (projectType === 'static') return 80;
  const match = dockerfileContent.match(/^\s*EXPOSE\s+(\d+)/im);
  return match ? Number(match[1]) : DEFAULT_PORT;
}

export async function runBuildPipeline(deploymentId: string): Promise<void> {
  const deployment = await prisma.deployment.findUniqueOrThrow({
    where: { id: deploymentId },
    include: { repository: true, user: true },
  });
  const { repository, user } = deployment;
  const workspace = path.join(os.tmpdir(), 'deployiq-builds', randomUUID());
  const log = (
    stage: Parameters<typeof appendLog>[1],
    level: Parameters<typeof appendLog>[2],
    message: string,
  ) => appendLog(deploymentId, stage, level, message);

  try {
    await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'CLONING' } });
    await log('CLONE', 'INFO', `Cloning ${repository.fullName}@${deployment.branch}...`);

    const accessToken = decrypt(user.accessTokenEncrypted);
    await cloneRepository({
      fullName: repository.fullName,
      branch: deployment.branch,
      accessToken,
      destDir: workspace,
      onLog: (line) => void log('CLONE', 'INFO', line),
    });

    await log('DETECT', 'INFO', 'Detecting project type...');
    const projectType = detectProjectType(workspace);
    await log('DETECT', 'INFO', `Detected project type: ${projectType}`);

    await log('BUILD', 'INFO', 'Generating Dockerfile...');
    const dockerfileContent = generateDockerfile(workspace, projectType);
    const containerPort = detectContainerPort(dockerfileContent, projectType);

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'BUILDING', containerPort },
    });
    const registry = getRegistry();
    const imageTag = registry.imageTag(slugify(repository.fullName), deployment.commitSha);
    await log('BUILD', 'INFO', `Building image ${imageTag}...`);
    await buildImage({
      dir: workspace,
      tag: imageTag,
      onLog: (line) => void log('BUILD', 'INFO', line),
    });

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'PUSHING', imageTag },
    });
    if (registry.isConfigured) {
      await log('PUSH', 'INFO', `Pushing ${imageTag}...`);
    }
    await registry.push(imageTag, (line) => void log('PUSH', 'INFO', line));

    await log('PUSH', 'INFO', 'Build complete — handing off to the Kubernetes Service.');
    await enqueueDeployJob(deploymentId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stage =
      err instanceof UnsupportedProjectError
        ? 'DETECT'
        : err instanceof GitCloneError
          ? 'CLONE'
          : 'BUILD';
    await log(stage, 'ERROR', message);
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'BUILD_FAILED' },
    });
    logger.error('Build pipeline failed', { deploymentId, err });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
