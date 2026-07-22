import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySignature } from './signature.js';

const secret = 'my-webhook-secret';
const body = Buffer.from(JSON.stringify({ ref: 'refs/heads/main', after: 'abc123' }));

function sign(payload: Buffer, key: string): string {
  return 'sha256=' + createHmac('sha256', key).update(payload).digest('hex');
}

describe('verifySignature', () => {
  it('accepts a correctly signed payload', () => {
    expect(verifySignature(body, secret, sign(body, secret))).toBe(true);
  });

  it('rejects a payload signed with the wrong secret', () => {
    expect(verifySignature(body, secret, sign(body, 'wrong-secret'))).toBe(false);
  });

  it('rejects a payload whose body was tampered with after signing', () => {
    const validSignature = sign(body, secret);
    const tamperedBody = Buffer.from(JSON.stringify({ ref: 'refs/heads/main', after: 'evil-sha' }));
    expect(verifySignature(tamperedBody, secret, validSignature)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifySignature(body, secret, undefined)).toBe(false);
  });

  it('rejects a malformed/short signature header without throwing', () => {
    // This is the specific case that used to crash the request: timingSafeEqual
    // throws on a buffer-length mismatch rather than returning false.
    expect(() => verifySignature(body, secret, 'sha256=short')).not.toThrow();
    expect(verifySignature(body, secret, 'sha256=short')).toBe(false);
  });

  it('rejects an empty string signature', () => {
    expect(verifySignature(body, secret, '')).toBe(false);
  });
});
