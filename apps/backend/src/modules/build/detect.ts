import { existsSync } from 'node:fs';
import path from 'node:path';

export type ProjectType = 'dockerfile-present' | 'node' | 'python' | 'go' | 'static';

export class UnsupportedProjectError extends Error {}

// Heuristic, file-existence-based detection — a real platform (Heroku,
// Railway) uses full buildpacks with dozens of signals per language. This
// covers the common cases and fails loudly on anything else rather than
// guessing wrong and producing a broken image.
export function detectProjectType(dir: string): ProjectType {
  if (existsSync(path.join(dir, 'Dockerfile'))) return 'dockerfile-present';
  if (existsSync(path.join(dir, 'package.json'))) return 'node';
  if (
    existsSync(path.join(dir, 'requirements.txt')) ||
    existsSync(path.join(dir, 'pyproject.toml'))
  ) {
    return 'python';
  }
  if (existsSync(path.join(dir, 'go.mod'))) return 'go';
  if (existsSync(path.join(dir, 'index.html'))) return 'static';

  throw new UnsupportedProjectError(
    'Could not detect a supported project type (looked for Dockerfile, package.json, requirements.txt/pyproject.toml, go.mod, index.html)',
  );
}
