import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ProjectType } from './detect.js';
import { UnsupportedProjectError } from './detect.js';

const DEFAULT_PORT = 3000;

function nodeDockerfile(dir: string): string {
  const pkgPath = path.join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    scripts?: Record<string, string>;
  };

  // A missing start script means `npm start` fails at container runtime —
  // catch it now, at build time, with a message that says what's actually
  // wrong, instead of shipping an image that crash-loops.
  if (!pkg.scripts?.start) {
    throw new UnsupportedProjectError(
      'package.json has no "start" script — add one (e.g. "start": "node index.js") so the container knows how to run the app',
    );
  }

  const installCmd = existsSync(path.join(dir, 'package-lock.json')) ? 'npm ci' : 'npm install';

  return `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN ${installCmd} --omit=dev
COPY . .
RUN npm run build --if-present
EXPOSE ${DEFAULT_PORT}
CMD ["npm", "start"]
`;
}

function pythonDockerfile(dir: string): string {
  const entrypoint = ['app.py', 'main.py'].find((f) => existsSync(path.join(dir, f)));
  if (!entrypoint) {
    throw new UnsupportedProjectError(
      'Could not find app.py or main.py — Python detection expects one of these as the entrypoint',
    );
  }

  return `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt* pyproject.toml* ./
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi
COPY . .
EXPOSE ${DEFAULT_PORT}
CMD ["python", "${entrypoint}"]
`;
}

function goDockerfile(): string {
  return `FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN go build -o /app/server .

FROM alpine:3.20
COPY --from=build /app/server /server
EXPOSE ${DEFAULT_PORT}
CMD ["/server"]
`;
}

function staticDockerfile(): string {
  return `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
`;
}

// Writes a Dockerfile into `dir` for the given detected type and returns
// its content (for logging). No-op — returns the existing file's content —
// when the repo already ships its own Dockerfile.
export function generateDockerfile(dir: string, type: ProjectType): string {
  if (type === 'dockerfile-present') {
    return readFileSync(path.join(dir, 'Dockerfile'), 'utf8');
  }

  const content = {
    node: () => nodeDockerfile(dir),
    python: () => pythonDockerfile(dir),
    go: goDockerfile,
    static: staticDockerfile,
  }[type]();

  writeFileSync(path.join(dir, 'Dockerfile'), content, 'utf8');
  return content;
}
