import { createPrivateKey } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const ConfigObjectSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  OPERATING_MODE: z.enum(['paper', 'live']).default('paper'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url().refine((value) => isRedisUrl(value), { message: 'REDIS_URL must use redis:// or rediss://' }),
  SESSION_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  POLYMARKET_GAMMA_URL: z.string().url().default('https://gamma-api.polymarket.com'),
  POLYMARKET_CLOB_URL: z.string().url().default('https://clob.polymarket.com'),
  POLYMARKET_PRIVATE_KEY: z.string().optional(),
  POLYMARKET_API_KEY: z.string().optional(),
  POLYMARKET_SECRET: z.string().optional(),
  POLYMARKET_PASSPHRASE: z.string().optional(),
  POLYMARKET_FUNDER_ADDRESS: z.string().optional(),
  POLYMARKET_SIGNATURE_TYPE: z.coerce.number().int().min(0).max(3).default(3),
  POLYMARKET_CHAIN_ID: z.coerce.number().int().default(137),
  KALSHI_API_URL: z.string().url().default('https://api.elections.kalshi.com/trade-api/v2'),
  KALSHI_KEY_ID: z.string().optional(),
  KALSHI_PRIVATE_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().optional(),
  STRICT_RESOLUTION_MODE: z.coerce.boolean().default(true),
  WATCHLIST_POLL_SECONDS: z.coerce.number().int().positive().default(5),
  ACTIVE_MARKET_POLL_SECONDS: z.coerce.number().int().positive().default(15),
  RECONCILIATION_SECONDS: z.coerce.number().int().positive().default(30),
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  SMTP_URL: z.string().optional(),
  SMS_WEBHOOK_URL: z.string().url().optional()
});

export const ConfigSchema = ConfigObjectSchema.superRefine((value, ctx) => {
  if ((value.KALSHI_KEY_ID && !value.KALSHI_PRIVATE_KEY) || (!value.KALSHI_KEY_ID && value.KALSHI_PRIVATE_KEY)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['KALSHI_KEY_ID'],
      message: 'Kalshi credentials require both KALSHI_KEY_ID and KALSHI_PRIVATE_KEY'
    });
  }
  if (value.KALSHI_PRIVATE_KEY && !isValidPrivateKey(value.KALSHI_PRIVATE_KEY)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['KALSHI_PRIVATE_KEY'],
      message: 'KALSHI_PRIVATE_KEY must be a valid PEM private key'
    });
  }
  const polymarketCredentialKeys = ['POLYMARKET_API_KEY', 'POLYMARKET_SECRET', 'POLYMARKET_PASSPHRASE'] as const;
  const configuredPolymarketCredentialCount = polymarketCredentialKeys.filter((key) => Boolean(value[key])).length;
  if (configuredPolymarketCredentialCount > 0 && configuredPolymarketCredentialCount < polymarketCredentialKeys.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['POLYMARKET_API_KEY'],
      message: 'Polymarket L2 credentials require POLYMARKET_API_KEY, POLYMARKET_SECRET, and POLYMARKET_PASSPHRASE'
    });
  }
  if (value.POLYMARKET_PRIVATE_KEY && !/^0x[0-9a-fA-F]{64}$/.test(value.POLYMARKET_PRIVATE_KEY)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['POLYMARKET_PRIVATE_KEY'],
      message: 'POLYMARKET_PRIVATE_KEY must be a 0x-prefixed 32-byte private key'
    });
  }
});

export type RuntimeConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid runtime configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const kalshiConfigured = Boolean(parsed.data.KALSHI_KEY_ID && parsed.data.KALSHI_PRIVATE_KEY);
  const polymarketConfigured = Boolean(parsed.data.POLYMARKET_PRIVATE_KEY);
  if (parsed.data.OPERATING_MODE === 'live' && !kalshiConfigured && !polymarketConfigured) {
    throw new Error('Live mode requires exchange credentials and explicit operator activation workflow.');
  }
  return parsed.data;
}

export interface ConfigValidationResult {
  ok: true;
  envFileLoaded: boolean;
  operatingMode: RuntimeConfig['OPERATING_MODE'];
  configuredKeys: string[];
}

export function validateConfigFromEnvFile(options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): ConfigValidationResult {
  const cwd = options.cwd ?? process.cwd();
  const env = { ...(options.env ?? process.env) };
  const envPath = resolve(cwd, '.env');
  const envFileLoaded = existsSync(envPath);
  if (envFileLoaded) {
    const loaded = loadDotenv({ path: envPath, processEnv: env, override: false, quiet: true });
    if (loaded.error) throw loaded.error;
  }

  const config = loadConfig(env);
  return {
    ok: true,
    envFileLoaded,
    operatingMode: config.OPERATING_MODE,
    configuredKeys: Object.keys(ConfigObjectSchema.shape).filter((key) => Boolean(env[key]))
  };
}

function isValidPrivateKey(value: string): boolean {
  try {
    createPrivateKey(value.replace(/\\n/g, '\n'));
    return true;
  } catch {
    return false;
  }
}

function isRedisUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'redis:' || protocol === 'rediss:';
  } catch {
    return false;
  }
}

export interface AuditedConfigChange {
  actorId: string;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  changedAt: Date;
}

export function mergeRuntimeConfig<T extends Record<string, unknown>>(
  codeDefaults: T,
  environment: Partial<T>,
  databaseRuntime: Partial<T>,
  sessionOverrides: Partial<T>
): T {
  return { ...codeDefaults, ...environment, ...databaseRuntime, ...sessionOverrides };
}
