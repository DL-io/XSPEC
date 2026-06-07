import { authError, requireApiAccess } from '../_server';

const CONFIG_KEYS = [
  'NODE_ENV',
  'OPERATING_MODE',
  'DATABASE_URL',
  'REDIS_URL',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
  'POLYMARKET_GAMMA_URL',
  'POLYMARKET_CLOB_URL',
  'KALSHI_API_URL',
  'KALSHI_KEY_ID',
  'KALSHI_PRIVATE_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GROQ_API_KEY',
  'OLLAMA_BASE_URL',
  'STRICT_RESOLUTION_MODE',
  'WATCHLIST_POLL_SECONDS',
  'ACTIVE_MARKET_POLL_SECONDS',
  'RECONCILIATION_SECONDS',
  'ALERT_WEBHOOK_URL',
  'SMTP_URL',
  'SMS_WEBHOOK_URL',
  'ALLOWED_ORIGINS',
  'TRUST_OPERATOR_ROLE_HEADERS',
  'TRUSTED_PROXY_HOPS'
] as const;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get('tenantId');
    if (!tenantId) return Response.json({ error: 'tenantId required' }, { status: 400 });
    await requireApiAccess(request, { tenantId, permission: 'read', apiScope: 'api:read' });
    return Response.json({
      keys: CONFIG_KEYS.map((key) => ({
        key,
        status: process.env[key] ? 'SET' : 'MISSING'
      }))
    }); // HARDENED: exposes config presence only, never secret values.
  } catch (error) {
    return authError(error);
  }
}
