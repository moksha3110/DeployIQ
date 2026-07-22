import { type ChildProcess, spawn } from 'node:child_process';
import { findFreePort } from '../../common/free-port.js';

// We generate a real Ingress (see manifests.ts) for architectural parity
// with a production cluster, but making it *clickable* on a developer's
// machine would require an OS hosts-file entry we have no business editing
// automatically. `kubectl port-forward` needs no DNS and works identically
// on Minikube or any other cluster reachable via kubeconfig, so it's what
// actually backs the publicUrl shown in the UI for local dev.
const activeForwards = new Map<string, ChildProcess>();

export async function startPortForward(namespace: string, serviceName: string): Promise<number> {
  stopPortForward(namespace);

  const port = await findFreePort();
  const child = spawn(
    'kubectl',
    ['port-forward', '-n', namespace, `svc/${serviceName}`, `${port}:80`],
    { stdio: 'ignore' },
  );
  activeForwards.set(namespace, child);
  child.on('exit', () => activeForwards.delete(namespace));

  // kubectl needs a moment to bind the local port before it's actually
  // reachable — a short fixed wait is simpler and just as reliable here as
  // polling the port, since this only runs once per deploy.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return port;
}

export function stopPortForward(namespace: string): void {
  const existing = activeForwards.get(namespace);
  if (existing) {
    existing.kill();
    activeForwards.delete(namespace);
  }
}
