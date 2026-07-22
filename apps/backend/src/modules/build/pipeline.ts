import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { decrypt } from '../../common/crypto.js';
import { logger } from '../../common/logger.js';
import { analyzeFailure } from '../ai/analyze.js';
import { appendLog } from '../deployments/log.js';
import { prisma } from '../../prisma/client.js';
import { enqueueDeployJob } from '../../queues/deploy-queue.js';
import { detectContainerPort } from './container-port.js';
import { detectProjectType, UnsupportedProjectError } from './detect.js';
import { generateDockerfile } from './dockerfile-templates.js';
import { buildImage } from './docker.js';
import { cloneRepository, GitCloneError } from './git.js';
import { getRegistry } from './registry.js';
import { scanImage } from './scan.js';

function slugify(fullName: string): string {
  return fullName.toLowerCase().replaceAll('/', '-');
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

    await log('BUILD', 'INFO', 'Scanning image for known vulnerabilities (Trivy)...');
    const scan = await scanImage(imageTag);
    if (scan.scanFailed) {
      await log(
        'BUILD',
        'INFO',
        'Vulnerability scan did not complete — skipping, not blocking the deploy.',
      );
    } else if (scan.vulnerabilities.length === 0) {
      await log('BUILD', 'INFO', 'No HIGH/CRITICAL vulnerabilities found.');
    } else {
      const critical = scan.vulnerabilities.filter((v) => v.severity === 'CRITICAL').length;
      const high = scan.vulnerabilities.length - critical;
      await log(
        'BUILD',
        'WARN',
        `Found ${critical} CRITICAL and ${high} HIGH vulnerabilities (not blocking — informational only):`,
      );
      for (const v of scan.vulnerabilities.slice(0, 20)) {
        await log(
          'BUILD',
          'WARN',
          `  ${v.severity} ${v.id} — ${v.pkgName}@${v.installedVersion}${v.fixedVersion ? ` (fixed in ${v.fixedVersion})` : ' (no fix available)'}`,
        );
      }
      if (scan.vulnerabilities.length > 20) {
        await log('BUILD', 'WARN', `  ...and ${scan.vulnerabilities.length - 20} more`);
      }
    }

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
    await analyzeFailure(deploymentId, stage);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
