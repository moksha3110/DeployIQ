import { type ChildProcess, spawn } from 'node:child_process';
import { findFreePort } from './free-port.js';

// Our backend runs on the host, outside the cluster. Minikube's Docker
// driver (Windows/Mac) only publishes a fixed handful of ports from the
// node container — an arbitrary NodePort is not reachable via
// `minikube ip:port` the way it would be on a Linux VM driver (confirmed
// against a real cluster during Milestone 5). `kubectl port-forward` needs
// no DNS and works identically regardless of driver, so every persistent
// connection this backend makes to something living in the cluster
// (Prometheus, Loki) goes through one of these instead.
//
// Returns a function that lazily establishes the forward on first call and
// reuses it afterward, re-establishing if the child process has died.
export function createClusterForward(namespace: string, service: string, remotePort: number) {
  let child: ChildProcess | null = null;
  let baseUrl: string | null = null;

  return async function getBaseUrl(): Promise<string> {
    if (baseUrl && child && !child.killed) return baseUrl;

    const localPort = await findFreePort();
    child = spawn(
      'kubectl',
      ['port-forward', '-n', namespace, `svc/${service}`, `${localPort}:${remotePort}`],
      { stdio: 'ignore' },
    );
    child.on('exit', () => {
      child = null;
      baseUrl = null;
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));
    baseUrl = `http://localhost:${localPort}`;
    return baseUrl;
  };
}
