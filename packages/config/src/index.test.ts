import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './index';

describe('runtime config Kalshi credentials', () => {
  it('requires Kalshi key id and private key as a pair', () => {
    expect(() => loadConfig(baseEnv({ KALSHI_KEY_ID: 'key-id' }))).toThrow(/both KALSHI_KEY_ID and KALSHI_PRIVATE_KEY/);
    expect(() => loadConfig(baseEnv({ KALSHI_PRIVATE_KEY: privateKeyPem() }))).toThrow(/both KALSHI_KEY_ID and KALSHI_PRIVATE_KEY/);
  });

  it('rejects invalid Kalshi private keys clearly', () => {
    expect(() => loadConfig(baseEnv({ KALSHI_KEY_ID: 'key-id', KALSHI_PRIVATE_KEY: 'not-a-private-key' }))).toThrow(/valid PEM private key/);
  });

  it('accepts valid Kalshi credentials without requiring live mode', () => {
    expect(loadConfig(baseEnv({ KALSHI_KEY_ID: 'key-id', KALSHI_PRIVATE_KEY: privateKeyPem() })).KALSHI_KEY_ID).toBe('key-id');
  });

  it('requires a standard Redis connection URL', () => {
    expect(() => loadConfig(baseEnv({ REDIS_URL: 'https://example.test' }))).toThrow(/REDIS_URL must use redis:\/\/ or rediss:\/\//);
    expect(() => loadConfig(baseEnv({ REDIS_URL: 'redis://localhost:6379' }))).not.toThrow();
    expect(() => loadConfig(baseEnv({ REDIS_URL: 'rediss://default:secret@example.test:6379' }))).not.toThrow();
  });
});

function baseEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return Object.assign({
    NODE_ENV: 'test',
    OPERATING_MODE: 'paper',
    DATABASE_URL: 'mysql://user:pass@localhost:3306/db',
    REDIS_URL: 'redis://localhost:6379',
    SESSION_SECRET: 'session-secret-at-least-thirty-two-chars',
    ENCRYPTION_KEY: 'encryption-key-at-least-thirty-two'
  }, overrides) as NodeJS.ProcessEnv;
}

function privateKeyPem(): string {
  return generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
}
