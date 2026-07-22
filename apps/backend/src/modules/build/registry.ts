import { env } from '../../config/env.js';
import { loginRegistry, pushImage } from './docker.js';

// Strategy pattern: swapping registries (or going registry-less for local
// Minikube dev) is a config decision, not a code change. See
// docs/ARCHITECTURE.md's "Docker Hub (configurable)" rationale.
export interface ImageRegistry {
  readonly isConfigured: boolean;
  imageTag(repoSlug: string, commitSha: string): string;
  push(tag: string, onLog: (line: string) => void): Promise<void>;
}

class DockerHubRegistry implements ImageRegistry {
  readonly isConfigured = true;

  constructor(
    private readonly registry: string,
    private readonly username: string,
    private readonly password: string,
  ) {}

  imageTag(repoSlug: string, commitSha: string): string {
    return `${this.registry}/${this.username}/${repoSlug}:${commitSha}`;
  }

  async push(tag: string, onLog: (line: string) => void): Promise<void> {
    await loginRegistry({
      registry: this.registry,
      username: this.username,
      password: this.password,
      onLog,
    });
    await pushImage({ tag, onLog });
  }
}

// Used when no registry credentials are configured. The image is built and
// tagged locally but never pushed — sufficient for Milestone 4 to deploy
// onto Minikube's own Docker daemon (`imagePullPolicy: Never`), not
// sufficient for a multi-node cluster. That tradeoff is intentional for
// local dev, not a bug: see docs/ARCHITECTURE.md.
class LocalOnlyRegistry implements ImageRegistry {
  readonly isConfigured = false;

  imageTag(repoSlug: string, commitSha: string): string {
    return `deployiq/${repoSlug}:${commitSha}`;
  }

  async push(_tag: string, onLog: (line: string) => void): Promise<void> {
    onLog('No registry configured — skipping push, image stays local-only.\n');
  }
}

export function getRegistry(): ImageRegistry {
  if (env.DOCKER_REGISTRY_USERNAME && env.DOCKER_REGISTRY_PASSWORD) {
    return new DockerHubRegistry(
      env.DOCKER_REGISTRY,
      env.DOCKER_REGISTRY_USERNAME,
      env.DOCKER_REGISTRY_PASSWORD,
    );
  }
  return new LocalOnlyRegistry();
}
