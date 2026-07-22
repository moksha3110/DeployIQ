import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from './crypto.js';

describe('crypto', () => {
  it('round-trips a plaintext string through encrypt/decrypt', () => {
    const plaintext = 'ghp_someRealisticLookingGithubToken1234567890';
    const ciphertext = encrypt(plaintext);

    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encrypt('same input');
    const b = encrypt('same input');
    expect(a).not.toBe(b);
  });

  it('rejects a tampered ciphertext instead of silently returning garbage', () => {
    const ciphertext = encrypt('sensitive value');
    const [iv, authTag, data] = ciphertext.split(':');
    // Flip the last hex character of the encrypted data — GCM's auth tag must catch this.
    const flipped = data!.at(-1) === '0' ? '1' : '0';
    const tampered = `${iv}:${authTag}:${data!.slice(0, -1)}${flipped}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('rejects malformed ciphertext (wrong number of segments)', () => {
    expect(() => decrypt('not-a-valid-ciphertext')).toThrow('Malformed ciphertext');
  });
});
