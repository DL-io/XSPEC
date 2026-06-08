import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { liveReadiness, loadConfig, validateConfigFromEnvFile } from './index';

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

  it('fails live mode closed with an explicit missing-field readiness map', () => {
    expect(() => loadConfig(baseEnv({ OPERATING_MODE: 'live' }))).toThrow(/Live mode is not ready/);
    const readiness = liveReadiness(loadConfig(baseEnv()));
    expect(readiness.ready).toBe(false);
    expect(Object.keys(readiness.missing)).toContain('LIVE_TRADING_ENABLED');
    expect(Object.keys(readiness.missing)).toContain('POLYMARKET_PRIVATE_KEY');
  });

  it('reports live readiness only when all required live controls and Polymarket credentials are set', () => {
    const config = loadConfig(baseEnv({
      LIVE_TRADING_ENABLED: 'true',
      KILLSWITCH_ARMED: 'true',
      POLYMARKET_PRIVATE_KEY: `0x${'1'.repeat(64)}`,
      POLYMARKET_API_KEY: 'pm-key',
      POLYMARKET_SECRET: 'pm-secret',
      POLYMARKET_PASSPHRASE: 'pm-passphrase'
    }));
    expect(liveReadiness(config)).toMatchObject({ ready: true, missing: {} });
  });

  it('requires a standard Redis connection URL', () => {
    expect(() => loadConfig(baseEnv({ REDIS_URL: 'https://example.test' }))).toThrow(/REDIS_URL must use redis:\/\/ or rediss:\/\//);
    expect(() => loadConfig(baseEnv({ REDIS_URL: 'redis://localhost:6379' }))).not.toThrow();
    expect(() => loadConfig(baseEnv({ REDIS_URL: 'rediss://default:secret@example.test:6379' }))).not.toThrow();
  });

  it('loads .env during explicit validation', () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, '.env'), [
      'NODE_ENV=test',
      'OPERATING_MODE=paper',
      'DATABASE_URL=mysql://user:pass@localhost:3306/db',
      'REDIS_URL=redis://localhost:6379',
      'SESSION_SECRET=session-secret-at-least-thirty-two-chars',
      'ENCRYPTION_KEY=encryption-key-at-least-thirty-two'
    ].join('\n'));

    expect(validateConfigFromEnvFile({ cwd, env: {} as NodeJS.ProcessEnv })).toMatchObject({
      ok: true,
      envFileLoaded: true,
      operatingMode: 'paper'
    });
  });

  it('fails clearly when required env is missing', () => {
    expect(() => validateConfigFromEnvFile({ cwd: tempDir(), env: {} as NodeJS.ProcessEnv })).toThrow(/DATABASE_URL: Required/);
  });

  it('does not expose secret values in validation output', () => {
    const secret = 'session-secret-value-that-must-not-print';
    const result = validateConfigFromEnvFile({ cwd: tempDir(), env: baseEnv({ SESSION_SECRET: secret }) });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('accepts configured research provider keys', () => {
    const config = loadConfig(baseEnv({ OPENAI_API_KEY: 'openai-key', TAVILY_API_KEY: 'tavily-key', RESEARCH_PROVIDERS_REQUIRED: 'true' }));

    expect(config.OPENAI_API_KEY).toBe('openai-key');
    expect(config.TAVILY_API_KEY).toBe('tavily-key');
    expect(config.RESEARCH_PROVIDERS_REQUIRED).toBe(true);
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

function tempDir(): string {
  const path = join(tmpdir(), `polyshore-config-${crypto.randomUUID()}`);
  mkdirSync(path, { recursive: true });
  return path;
}
