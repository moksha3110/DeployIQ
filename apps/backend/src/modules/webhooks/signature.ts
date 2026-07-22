import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifySignature(
  rawBody: Buffer,
  secret: string,
  header: string | undefined,
): boolean {
  if (!header) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(header);
  // timingSafeEqual throws on length mismatch rather than returning false —
  // guard explicitly instead of letting a malformed header 500 the request.
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
