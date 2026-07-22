import { createHmac, timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import { decrypt } from '../../common/crypto.js';
import { logger } from '../../common/logger.js';
import { prisma } from '../../prisma/client.js';
import { createDeployment } from '../deployments/create.js';

export const webhooksRouter = Router();

interface GithubPushPayload {
  ref: string;
  after: string;
  repository: { id: number };
}

const ZERO_SHA = '0'.repeat(40);

function verifySignature(rawBody: Buffer, secret: string, header: string | undefined): boolean {
  if (!header) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(header);
  // timingSafeEqual throws on length mismatch rather than returning false —
  // guard explicitly instead of letting a malformed header 500 the request.
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

// Raw body needed for HMAC verification — must run before the app-wide
// express.json() (see server.ts, this router is mounted ahead of it) or
// the body stream would already be consumed.
webhooksRouter.post('/github', express.raw({ type: 'application/json' }), async (req, res) => {
  const event = req.headers['x-github-event'];
  const rawBody = req.body as Buffer;

  if (event === 'ping') {
    res.status(200).send('pong');
    return;
  }
  if (event !== 'push') {
    res.status(200).send('ignored'); // ack anyway — GitHub retries non-2xx
    return;
  }

  let payload: GithubPushPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).send('invalid JSON');
    return;
  }

  const repository = await prisma.repository.findUnique({
    where: { githubRepoId: String(payload.repository.id) },
  });
  if (!repository?.webhookSecret) {
    // Either we've never heard of this repo, or auto-deploy was disabled
    // (webhookSecret cleared) after GitHub already had the hook queued —
    // 404 either way, nothing to verify against.
    res.status(404).send('not configured');
    return;
  }

  const secret = decrypt(repository.webhookSecret);
  const signatureHeader = req.headers['x-hub-signature-256'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!verifySignature(rawBody, secret, signature)) {
    res.status(401).send('invalid signature');
    return;
  }

  const branch = payload.ref.replace('refs/heads/', '');
  const commitSha = payload.after;

  // Only the branch tracked at auto-deploy-enable time triggers a build —
  // per-branch auto-deploy config is a documented gap, not silently ignored.
  if (branch !== repository.defaultBranch) {
    res.status(200).send('branch not tracked');
    return;
  }
  if (commitSha === ZERO_SHA) {
    res.status(200).send('branch deleted'); // GitHub's all-zero SHA for a branch-delete push
    return;
  }

  // GitHub delivers at-least-once and retries on timeout — a retry of a
  // push we already started must not queue a second build.
  const existing = await prisma.deployment.findFirst({
    where: { repositoryId: repository.id, commitSha, triggeredBy: 'WEBHOOK' },
  });
  if (existing) {
    res.status(200).json({ deploymentId: existing.id, deduped: true });
    return;
  }

  try {
    const deploymentId = await createDeployment({
      userId: repository.userId,
      repositoryId: repository.id,
      branch,
      commitSha,
      triggeredBy: 'WEBHOOK',
    });
    res.status(200).json({ deploymentId });
  } catch (err) {
    logger.error('Failed to create deployment from webhook', { repositoryId: repository.id, err });
    res.status(500).send('failed to queue deployment');
  }
});
