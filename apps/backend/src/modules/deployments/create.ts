import { decrypt } from '../../common/crypto.js';
import { prisma } from '../../prisma/client.js';
import { fetchBranchCommitSha, fetchRepository } from '../github/client.js';
import { enqueueBuildJob } from '../../queues/build-queue.js';
import type { TriggerSource } from '@platform/shared-types';

// Shared by the manual "Deploy" button (POST /deployments) and the GitHub
// webhook handler, so both go through one code path rather than two
// slightly-different reimplementations of "create a Deployment row and
// enqueue a build."
export async function createDeployment(params: {
  userId: string;
  repositoryId: string; // our internal Repository.id, already resolved
  branch: string;
  commitSha: string;
  triggeredBy: TriggerSource;
}): Promise<string> {
  const deployment = await prisma.deployment.create({
    data: {
      repositoryId: params.repositoryId,
      userId: params.userId,
      branch: params.branch,
      commitSha: params.commitSha,
      status: 'PENDING',
      triggeredBy: params.triggeredBy,
    },
  });
  await enqueueBuildJob(deployment.id);
  return deployment.id;
}

// The manual-deploy path: resolves everything from the GitHub repo id the
// frontend sends (see RepositorySummary.id), fetching current branch/commit
// state live from GitHub and lazily upserting our own Repository row.
export async function createDeploymentForUser(params: {
  userId: string;
  githubRepoId: string;
  branch: string;
}): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: params.userId } });
  const accessToken = decrypt(user.accessTokenEncrypted);

  const githubRepo = await fetchRepository(accessToken, params.githubRepoId);
  const commitSha = await fetchBranchCommitSha(accessToken, githubRepo.fullName, params.branch);

  const repository = await prisma.repository.upsert({
    where: { githubRepoId: githubRepo.id },
    create: {
      githubRepoId: githubRepo.id,
      userId: params.userId,
      name: githubRepo.name,
      fullName: githubRepo.fullName,
      defaultBranch: githubRepo.defaultBranch,
      isPrivate: githubRepo.isPrivate,
    },
    update: {
      name: githubRepo.name,
      fullName: githubRepo.fullName,
      defaultBranch: githubRepo.defaultBranch,
      isPrivate: githubRepo.isPrivate,
    },
  });

  return createDeployment({
    userId: params.userId,
    repositoryId: repository.id,
    branch: params.branch,
    commitSha,
    triggeredBy: 'MANUAL',
  });
}
