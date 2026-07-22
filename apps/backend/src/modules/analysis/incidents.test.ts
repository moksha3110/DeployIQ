import { describe, expect, it } from 'vitest';
import { classifyPod } from './incidents.js';
import type { LivePodStatus } from '../kubernetes/inspect.js';

function pod(overrides: Partial<LivePodStatus>): LivePodStatus {
  return { name: 'app-1', phase: 'Running', ready: true, restartCount: 0, badReason: null, ...overrides };
}

describe('classifyPod', () => {
  it('classifies CrashLoopBackOff', () => {
    expect(classifyPod(pod({ badReason: 'CrashLoopBackOff' }))).toBe('CRASH_LOOP_BACKOFF');
  });

  it('classifies ImagePullBackOff and ErrImagePull as the same incident type', () => {
    expect(classifyPod(pod({ badReason: 'ImagePullBackOff' }))).toBe('IMAGE_PULL_ERROR');
    expect(classifyPod(pod({ badReason: 'ErrImagePull' }))).toBe('IMAGE_PULL_ERROR');
  });

  it('classifies OOMKilled', () => {
    expect(classifyPod(pod({ badReason: 'OOMKilled' }))).toBe('OOM_KILLED');
  });

  it('classifies a Pending pod with no other reason as unschedulable', () => {
    expect(classifyPod(pod({ phase: 'Pending', badReason: null }))).toBe('PENDING_UNSCHEDULABLE');
  });

  it('returns null for a healthy running pod', () => {
    expect(classifyPod(pod({}))).toBeNull();
  });

  it('falls back to OTHER for an unrecognized bad reason', () => {
    expect(classifyPod(pod({ badReason: 'SomeUnknownReason' }))).toBe('OTHER');
  });
});
