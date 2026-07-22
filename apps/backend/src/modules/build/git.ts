import { spawn } from 'node:child_process';

export class GitCloneError extends Error {}

// The token is embedded in the clone URL (GitHub's documented way to
// authenticate over HTTPS) — critical that it never reaches a log line.
// child_process argv isn't visible to other users on this host the way a
// shell history file would be, but we still redact defensively in any
// error message since stderr can echo back the command it ran.
export async function cloneRepository(options: {
  fullName: string;
  branch: string;
  accessToken: string;
  destDir: string;
  onLog: (line: string) => void;
}): Promise<void> {
  const { fullName, branch, accessToken, destDir, onLog } = options;
  const authedUrl = `https://x-access-token:${accessToken}@github.com/${fullName}.git`;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'git',
      ['clone', '--depth', '1', '--branch', branch, '--single-branch', authedUrl, destDir],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const redact = (chunk: Buffer) => chunk.toString('utf8').replaceAll(accessToken, '***');

    child.stdout.on('data', (chunk: Buffer) => onLog(redact(chunk)));
    child.stderr.on('data', (chunk: Buffer) => onLog(redact(chunk)));

    child.on('error', (err) => reject(new GitCloneError(err.message)));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new GitCloneError(`git clone exited with code ${code}`));
    });
  });
}
