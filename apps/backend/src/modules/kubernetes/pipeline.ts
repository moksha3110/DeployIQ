import { spawn } from 'node:child_process';
import { getRegistry } from '../build/registry.js';
import { logger } from '../../common/logger.js';
import { appendLog } from '../deployments/log.js';
import { prisma } from '../../prisma/client.js';
import { applyDeployment, applyHpa, applyIngress, applyNamespace, applyService } from './apply.js';
import {
  buildDeployment,
  buildHpa,
  buildIngress,
  buildNamespace,
  buildService,
} from './manifests.js';
import type { ManifestInput } from './manifests.js';
import { startPortForward } from './port-forward.js';
import { RolloutFailedError, RolloutTimeoutError, waitForRollout } from './rollout.js';

const APP_NAME = 'app';

function namespaceFor(deploymentId: string): string {
  return `deploy-${deploymentId.slice(0, 8)}`;
}

// Only meaningful when the registry is local-only (see build/registry.ts):
// makes the image built on the host's Docker daemon visible inside
// Minikube's own container runtime, which does not share that daemon.
async function loadImageIntoMinikube(tag: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('minikube', ['image', 'load', tag], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`minikube image load exited ${code}`)),
    );
  });
}

export async function runDeployPipeline(deploymentId: string): Promise<void> {
  const deployment = await prisma.deployment.findUniqueOrThrow({
    where: { id: deploymentId },
    include: { repository: true },
  });
  const log = (level: 'INFO' | 'ERROR', message: string) =>
    appendLog(deploymentId, 'DEPLOY', level, message);
  const namespace = namespaceFor(deploymentId);

  if (!deployment.imageTag) {
    throw new Error('Deployment has no imageTag — the build stage must complete before deploying');
  }

  try {
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'DEPLOYING', namespace },
    });

    const registry = getRegistry();
    if (!registry.isConfigured) {
      await log('INFO', `Loading ${deployment.imageTag} into Minikube (no registry configured)...`);
      await loadImageIntoMinikube(deployment.imageTag);
    }

    const input: ManifestInput = {
      namespace,
      appName: APP_NAME,
      image: deployment.imageTag,
      containerPort: deployment.containerPort,
      imagePullPolicy: registry.isConfigured ? 'IfNotPresent' : 'Never',
      ingressHost: `${namespace}.platform.local`,
    };

    await log('INFO', `Applying manifests in namespace ${namespace}...`);
    await applyNamespace(buildNamespace(input));
    await applyDeployment(namespace, APP_NAME, buildDeployment(input));
    await applyService(namespace, APP_NAME, buildService(input));
    await applyIngress(namespace, APP_NAME, buildIngress(input));
    await applyHpa(namespace, APP_NAME, buildHpa(input));

    await log('INFO', 'Waiting for rollout...');
    await waitForRollout(namespace, APP_NAME);

    await log('INFO', 'Rollout healthy — starting port-forward for local access...');
    const port = await startPortForward(namespace, APP_NAME);
    const publicUrl = `http://localhost:${port}`;

    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'RUNNING', publicUrl },
    });
    await log('INFO', `Deployed: ${publicUrl}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log('ERROR', message);
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { status: 'DEPLOY_FAILED' },
    });
    if (!(err instanceof RolloutFailedError || err instanceof RolloutTimeoutError)) {
      logger.error('Deploy pipeline failed', { deploymentId, err });
    }
  }
}
