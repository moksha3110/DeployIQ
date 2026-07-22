import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectProjectType, UnsupportedProjectError } from './detect.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'detect-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function touch(file: string) {
  writeFileSync(path.join(dir, file), '');
}

describe('detectProjectType', () => {
  it('detects an existing Dockerfile first, ahead of any other marker', () => {
    touch('Dockerfile');
    touch('package.json'); // would otherwise match 'node' — Dockerfile must win
    expect(detectProjectType(dir)).toBe('dockerfile-present');
  });

  it('detects node from package.json', () => {
    touch('package.json');
    expect(detectProjectType(dir)).toBe('node');
  });

  it('detects python from requirements.txt', () => {
    touch('requirements.txt');
    expect(detectProjectType(dir)).toBe('python');
  });

  it('detects python from pyproject.toml', () => {
    touch('pyproject.toml');
    expect(detectProjectType(dir)).toBe('python');
  });

  it('detects go from go.mod', () => {
    touch('go.mod');
    expect(detectProjectType(dir)).toBe('go');
  });

  it('detects static from index.html', () => {
    touch('index.html');
    expect(detectProjectType(dir)).toBe('static');
  });

  it('throws UnsupportedProjectError when no marker file is present', () => {
    touch('README.md');
    expect(() => detectProjectType(dir)).toThrow(UnsupportedProjectError);
  });
});
