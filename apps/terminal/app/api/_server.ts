import { loadConfig } from '@polyshore/config';
import { can, roleFromHeader } from '@polyshore/auth';
import { ApiKeyRepository, createDb } from '@polyshore/db';

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
  return Response.json({ error: message }, { status });
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export async function requireApiAccess(request: Request, input: { tenantId: string; permission: string }) {
  rateLimit(request, input.tenantId);
  const apiKey = request.headers.get('x-api-key') ?? bearerToken(request.headers.get('authorization'));
  if (apiKey) {
    const apiClient = await new ApiKeyRepository(getDb()).validate({ tenantId: input.tenantId, rawKey: apiKey, requiredScope: input.permission });
    if (!apiClient) throw new ApiAuthError('invalid API key or scope', 401);
    return { actorId: apiClient.apiClientId, role: 'api_only' as const };
  }
  const role = roleFromHeader(request.headers.get('x-polyshore-role'));
  if (!can(role, input.permission)) throw new ApiAuthError(`role ${role} lacks ${input.permission}`, 403);
  return { actorId: request.headers.get('x-operator-id') ?? role, role };
}

export class ApiAuthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function authError(error: unknown) {
  if (error instanceof ApiAuthError) return jsonError(error.message, error.status);
  throw error;
}

function rateLimit(request: Request, tenantId: string) {
  const now = Date.now();
  const key = `${tenantId}:${request.headers.get('x-forwarded-for') ?? 'local'}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  bucket.count += 1;
  if (bucket.count > 120) throw new ApiAuthError('rate limit exceeded', 429);
}

function bearerToken(value: string | null): string | undefined {
  if (!value?.startsWith('Bearer ')) return undefined;
  return value.slice('Bearer '.length).trim();
}
