const DEFAULT_PORT = 3000;

// For our own generated Dockerfiles we already know the port (see
// dockerfile-templates.ts). For a repo that ships its own Dockerfile, the
// only reliable source is its EXPOSE directive — fall back to the default
// if it doesn't have one, since a missing EXPOSE isn't actually an error
// (Docker doesn't require it).
export function detectContainerPort(dockerfileContent: string, projectType: string): number {
  if (projectType === 'static') return 80;
  const match = dockerfileContent.match(/^\s*EXPOSE\s+(\d+)/im);
  return match ? Number(match[1]) : DEFAULT_PORT;
}
