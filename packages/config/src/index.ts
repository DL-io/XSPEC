import { z } from 'zod';

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  OPERATING_MODE: z.enum(['paper', 'live']).default('paper'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  POLYMARKET_GAMMA_URL: z.string().url().default('https://gamma-api.polymarket.com'),
  POLYMARKET_CLOB_URL: z.string().url().default('https://clob.polymarket.com'),
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

export type RuntimeConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid runtime configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  if (parsed.data.OPERATING_MODE === 'live' && (!parsed.data.KALSHI_KEY_ID || !parsed.data.KALSHI_PRIVATE_KEY)) {
    throw new Error('Live mode requires exchange credentials and explicit operator activation workflow.');
  }
  return parsed.data;
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
