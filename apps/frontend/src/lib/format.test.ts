import { describe, expect, it } from 'vitest';
import { formatCpu, formatMemory } from './format';

describe('formatCpu', () => {
  it('converts cores to millicores', () => {
    expect(formatCpu(0.5)).toBe('500m');
    expect(formatCpu(1)).toBe('1000m');
  });

  it('rounds to the nearest millicore', () => {
    expect(formatCpu(0.0004469)).toBe('0m');
    expect(formatCpu(0.0006)).toBe('1m');
  });

  it('handles zero', () => {
    expect(formatCpu(0)).toBe('0m');
  });
});

describe('formatMemory', () => {
  it('converts bytes to MiB', () => {
    expect(formatMemory(1024 * 1024)).toBe('1 MiB');
    expect(formatMemory(22 * 1024 * 1024)).toBe('22 MiB');
  });

  it('rounds to the nearest MiB', () => {
    expect(formatMemory(23146496)).toBe('22 MiB');
  });

  it('handles zero', () => {
    expect(formatMemory(0)).toBe('0 MiB');
  });
});
