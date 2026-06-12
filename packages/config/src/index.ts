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
  NEXT_PUBLIC_TENANT_ID: z.string().min(1).default('system'),
  NEXT_PUBLIC_OPERATOR_API_KEY: z.string().optional(),
  POLYMARKET_GAMMA_URL: z.string().url().default('https://gamma-api.polymarket.com'),
  POLYMARKET_CLOB_URL: z.string().url().default('https://clob.polymarket.com'),
  POLYMARKET_PRIVATE_KEY: z.string().optional(),
  POLYMARKET_API_KEY: z.string().optional(),
  POLYMARKET_SECRET: z.string().optional(),
  POLYMARKET_PASSPHRASE: z.string().optional(),
  POLYMARKET_FUNDER_ADDRESS: z.string().optional(),
  POLYMARKET_SIGNATURE_TYPE: z.coerce.number().int().min(0).max(3).default(3),
  POLYMARKET_CHAIN_ID: z.coerce.number().int().default(137),
  LIVE_TRADING_ENABLED: z.coerce.boolean().default(false),
  KILLSWITCH_ARMED: z.coerce.boolean().default(false),
  KALSHI_API_URL: z.string().url().default('https://api.elections.kalshi.com/trade-api/v2'),
  KALSHI_KEY_ID: z.string().optional(),
  KALSHI_PRIVATE_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  RESEARCH_PROVIDERS_REQUIRED: z.coerce.boolean().default(false),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().min(1).default('llama-3.3-70b-versatile'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  OLLAMA_BASE_URL: z.string().url().optional(),
  OLLAMA_MODEL: z.string().min(1).default('gemma3:27b'),
  STRICT_RESOLUTION_MODE: z.coerce.boolean().default(true),
  WATCHLIST_POLL_SECONDS: z.coerce.number().int().positive().default(5),
  ACTIVE_MARKET_POLL_SECONDS: z.coerce.number().int().positive().default(15),
  RECONCILIATION_SECONDS: z.coerce.number().int().positive().default(30),
  MANDATE_ID: z.enum(['ultra_conservative', 'conservative', 'balanced', 'aggressive']).default('conservative'),
  DAILY_LOSS_LIMIT: z.coerce.number().positive().default(500),
  DRAWDOWN_LIMIT: z.coerce.number().positive().max(1).default(0.1),
  MAX_OPEN_ORDERS: z.coerce.number().int().positive().default(10),
  MAX_PARTICIPATION_RATE: z.coerce.number().positive().max(1).default(0.1),
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  SMTP_URL: z.string().optional(),
  SMS_WEBHOOK_URL: z.string().url().optional(),
  DEMO_MODE: z.coerce.boolean().default(false)
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

export interface LiveReadinessCheck {
  ready: boolean;
  missing: Record<string, string>;
  configured: Record<string, boolean>;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid runtime configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const readiness = liveReadiness(parsed.data);
  if (parsed.data.OPERATING_MODE === 'live' && !readiness.ready) {
    throw new Error(`Live mode is not ready: ${Object.keys(readiness.missing).join(', ')}`);
  }
  return parsed.data;
}

export function liveReadiness(config: RuntimeConfig): LiveReadinessCheck {
  const configured = {
    LIVE_TRADING_ENABLED: config.LIVE_TRADING_ENABLED === true,
    KILLSWITCH_ARMED: config.KILLSWITCH_ARMED === true,
    POLYMARKET_PRIVATE_KEY: Boolean(config.POLYMARKET_PRIVATE_KEY),
    POLYMARKET_API_KEY: Boolean(config.POLYMARKET_API_KEY),
    POLYMARKET_SECRET: Boolean(config.POLYMARKET_SECRET),
    POLYMARKET_PASSPHRASE: Boolean(config.POLYMARKET_PASSPHRASE),
    POLYMARKET_CLOB_URL: Boolean(config.POLYMARKET_CLOB_URL),
    DATABASE_URL: Boolean(config.DATABASE_URL),
    REDIS_URL: Boolean(config.REDIS_URL),
    SESSION_SECRET: config.SESSION_SECRET.length >= 32,
    ENCRYPTION_KEY: config.ENCRYPTION_KEY.length >= 32,
    NEXT_PUBLIC_TENANT_ID: Boolean(config.NEXT_PUBLIC_TENANT_ID)
  };
  const descriptions: Record<keyof typeof configured, string> = {
    LIVE_TRADING_ENABLED: 'must be true for live execution',
    KILLSWITCH_ARMED: 'operator kill-switch control must be armed before live execution',
    POLYMARKET_PRIVATE_KEY: 'required for EIP-712 order signing',
    POLYMARKET_API_KEY: 'required for Polymarket L2 authenticated requests',
    POLYMARKET_SECRET: 'required for Polymarket L2 authenticated requests',
    POLYMARKET_PASSPHRASE: 'required for Polymarket L2 authenticated requests',
    POLYMARKET_CLOB_URL: 'required for CLOB API calls',
    DATABASE_URL: 'required for durable audit/order state',
    REDIS_URL: 'required for distributed rate limiting and runtime coordination',
    SESSION_SECRET: 'must be at least 32 characters',
    ENCRYPTION_KEY: 'must be at least 32 characters',
    NEXT_PUBLIC_TENANT_ID: 'required for terminal API requests'
  };
  const missing = Object.fromEntries(
    Object.entries(configured)
      .filter(([, ok]) => !ok)
      .map(([key]) => [key, descriptions[key as keyof typeof configured]])
  );
  return { ready: Object.keys(missing).length === 0, missing, configured };
}

export interface ConfigValidationResult {
  ok: true;
  envFileLoaded: boolean;
  operatingMode: RuntimeConfig['OPERATING_MODE'];
  configuredKeys: string[];
  liveReadiness: LiveReadinessCheck;
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
    configuredKeys: Object.keys(ConfigObjectSchema.shape).filter((key) => Boolean(env[key])),
    liveReadiness: liveReadiness(config)
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
