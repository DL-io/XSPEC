import { loadConfig } from '@polyshore/config';
import { can, roleFromHeader } from '@polyshore/auth';
import { ApiKeyRepository, createDb } from '@polyshore/db';
import { createClient, type RedisClientType } from 'redis';

const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;
const LOCAL_DEV_ROLE_HEADERS = process.env.NODE_ENV !== 'production' && process.env.TRUST_OPERATOR_ROLE_HEADERS === 'true';
const trustedProxyHops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
let redisClient: Promise<RedisClientType> | undefined;

export function getDb() {
  // Avoid hard-crashing the entire route module during build/start when
  // required env vars are missing. This keeps the app deployable.
  try {
    const config = loadConfig();
    return createDb(config.DATABASE_URL);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid runtime configuration';
    throw new Error(`DB init failed: ${message}`);
  }
}

export function jsonError(message: string, status = 500) {
  const requestId = crypto.randomUUID();
  return Response.json(
    { error: status >= 500 ? 'internal server error' : message, requestId },
    { status, headers: securityHeaders(requestId) }
  );
}

const buckets = new Map<string, { count: number; resetAt: number }>();

interface RateLimitResult { remaining: number; resetAt: number; }

export async function requireApiAccess(request: Request, input: { tenantId: string; permission: string; apiScope?: string }) {
  enforceOriginPolicy(request);
  const apiKey = request.headers.get('x-api-key') ?? bearerToken(request.headers.get('authorization'));
  if (apiKey) {
    const apiClient = await new ApiKeyRepository(getDb()).validate({ tenantId: input.tenantId, rawKey: apiKey, requiredScope: input.apiScope ?? input.permission });
    if (!apiClient) throw new ApiAuthError('invalid API key or scope', 401);
    const rateLimitState = await rateLimit(`api:${input.tenantId}:${apiClient.apiClientId}`, apiClient.rateLimitPerMinute); // HARDENED: expose distributed rate-limit metadata to mutation routes.
    return { actorId: apiClient.apiClientId, role: 'api_only' as const, tenantId: input.tenantId, rateLimit: rateLimitState };
  }
  if (!LOCAL_DEV_ROLE_HEADERS) throw new ApiAuthError('API key required', 401);
  const role = roleFromHeader(request.headers.get('x-polyshore-role'));
  if (!can(role, input.permission)) throw new ApiAuthError(`role ${role} lacks ${input.permission}`, 403);
  const actorId = request.headers.get('x-operator-id') ?? role;
  const rateLimitState = await rateLimit(`operator:${input.tenantId}:${actorId}:${trustedClientIp(request)}`, DEFAULT_RATE_LIMIT_PER_MINUTE); // HARDENED: dev fallback rate-limit metadata mirrors Redis shape.
  return { actorId, role, tenantId: input.tenantId, rateLimit: rateLimitState };
}

export class ApiAuthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function authError(error: unknown) {
  if (error instanceof ApiAuthError) return jsonError(error.message, error.status);
  return jsonError('internal server error', 500);
}

export function securityHeaders(requestId = crypto.randomUUID()) {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-request-id': requestId
  };
}

export function rateLimitHeaders(rateLimitState?: RateLimitResult): HeadersInit {
  return rateLimitState
    ? {
        'X-RateLimit-Remaining': String(rateLimitState.remaining), // HARDENED: mutation responses expose remaining request budget.
        'X-RateLimit-Reset': String(rateLimitState.resetAt) // HARDENED: clients can back off before hard failure.
      }
    : {};
}

async function rateLimit(key: string, limitPerMinute: number): Promise<RateLimitResult> {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const client = await getRedisClient(redisUrl);
      const redisKey = `polyshore:rate-limit:${key}`;
      const count = await client.incr(redisKey);
      if (count === 1) await client.expire(redisKey, 60);
      if (count > limitPerMinute) throw new ApiAuthError('rate limit exceeded', 429);
      const ttl = await client.ttl(redisKey);
      return { remaining: Math.max(0, limitPerMinute - count), resetAt: Math.floor(Date.now() / 1000) + Math.max(0, ttl) };
    } catch (error) {
      if (error instanceof ApiAuthError) throw error;
      redisClient = undefined;
      throw new ApiAuthError('rate limit backend unavailable', 503);
    }
  }
  if (process.env.NODE_ENV === 'production') throw new ApiAuthError('rate limit backend unavailable', 503);
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + 60_000;
    buckets.set(key, { count: 1, resetAt });
    return { remaining: limitPerMinute - 1, resetAt: Math.floor(resetAt / 1000) };
  }
  bucket.count += 1;
  if (bucket.count > limitPerMinute) throw new ApiAuthError('rate limit exceeded', 429);
  return { remaining: Math.max(0, limitPerMinute - bucket.count), resetAt: Math.floor(bucket.resetAt / 1000) };
}

async function getRedisClient(redisUrl: string): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = (async () => {
      const client = createClient({ url: redisUrl });
      client.on('error', () => undefined);
      await client.connect();
      return client as RedisClientType;
    })();
  }
  return redisClient;
}

function bearerToken(value: string | null): string | undefined {
  if (!value?.startsWith('Bearer ')) return undefined;
  return value.slice('Bearer '.length).trim();
}

function enforceOriginPolicy(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const host = request.headers.get('host');
  const allowed = new Set((process.env.ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
  if (host) {
    allowed.add(`https://${host}`);
    if (process.env.NODE_ENV !== 'production') allowed.add(`http://${host}`);
  }
  if (!allowed.has(origin)) throw new ApiAuthError('origin not allowed', 403);
}

export function trustedClientIp(request: Request): string {
  const direct = request.headers.get('x-real-ip') ?? 'local';
  if (trustedProxyHops <= 0) return direct;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').map((part) => part.trim()).filter(Boolean) ?? [];
  return forwarded.at(-trustedProxyHops) ?? direct;
}
