import { spawn } from 'node:child_process';

export class DockerCommandError extends Error {}

function runDocker(args: string[], options: { onLog: (line: string) => void }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    child.stdout.on('data', (chunk: Buffer) => options.onLog(chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => options.onLog(chunk.toString('utf8')));

    child.on('error', (err) => reject(new DockerCommandError(err.message)));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new DockerCommandError(`docker ${args[0]} exited with code ${code}`));
    });
  });
}

export function buildImage(options: {
  dir: string;
  tag: string;
  onLog: (line: string) => void;
}): Promise<void> {
  return runDocker(['build', '-t', options.tag, options.dir], { onLog: options.onLog });
}

export function pushImage(options: { tag: string; onLog: (line: string) => void }): Promise<void> {
  return runDocker(['push', options.tag], { onLog: options.onLog });
}

export function loginRegistry(options: {
  registry: string;
  username: string;
  password: string;
  onLog: (line: string) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      ['login', options.registry, '-u', options.username, '--password-stdin'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );

    child.stdout.on('data', (chunk: Buffer) => options.onLog(chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => options.onLog(chunk.toString('utf8')));
    child.on('error', (err) => reject(new DockerCommandError(err.message)));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new DockerCommandError(`docker login exited with code ${code}`));
    });

    child.stdin.write(options.password);
    child.stdin.end();
  });
}
