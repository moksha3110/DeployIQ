// config/env.ts validates and exits the process if required vars are
// missing — correct for a running server, hostile to unit tests, since
// almost everything transitively imports it. Setting dummy-but-valid
// values here (before any test file imports anything) satisfies that
// validation without touching real infrastructure — nothing here connects
// to an actual database, Redis, or GitHub.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.GITHUB_CLIENT_ID ??= 'test-client-id';
process.env.GITHUB_CLIENT_SECRET ??= 'test-client-secret';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-characters-long';
process.env.ENCRYPTION_KEY ??= '0'.repeat(64);
