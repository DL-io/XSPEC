import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { getEffectiveMandateId, getKalshiApiUrl, liveReadiness, loadConfig, resolveKalshiKey } from '@polyshore/config';
import { MANDATES, RISK_GATE_ORDER } from '@polyshore/risk';
import { signKalshiRequest } from '@polyshore/venues';
import { createClient } from 'redis';
import mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envPath = resolve(__dirname, '..', '.env');
if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });

const results: Array<{ check: string; ok: boolean; detail: string }> = [];
function pass(check: string, detail: string) { results.push({ check, ok: true, detail }); }
function fail(check: string, detail: string) { results.push({ check, ok: false, detail }); }

async function main() {
  // ── 1. Config schema ────────────────────────────────────────────────────────
  let config: ReturnType<typeof loadConfig> | undefined;
  try {
    config = loadConfig();
    pass('config.schema', `mode=${config.OPERATING_MODE}`);
  } catch (err) {
    fail('config.schema', err instanceof Error ? err.message : String(err));
  }

  // ── 2. Risk fortress ────────────────────────────────────────────────────────
  try {
    const expected = 19;
    if (RISK_GATE_ORDER.length !== expected) throw new Error(`expected ${expected} gates, got ${RISK_GATE_ORDER.length}`);
    pass('risk.gates', `${RISK_GATE_ORDER.length} gates`);
  } catch (err) {
    fail('risk.gates', err instanceof Error ? err.message : String(err));
  }

  // ── 3. Database connection ──────────────────────────────────────────────────
  if (config?.DATABASE_URL) {
    try {
      const conn = await mysql.createConnection({ uri: config.DATABASE_URL, connectTimeout: 6_000 });
      await conn.execute('SELECT 1');
      await conn.end();
      pass('db.connection', 'SELECT 1 OK');
    } catch (err) {
      fail('db.connection', err instanceof Error ? err.message : String(err));
    }
  } else {
    fail('db.connection', 'DATABASE_URL not set');
  }

  // ── 4. Redis connection ─────────────────────────────────────────────────────
  if (config?.REDIS_URL) {
    const client = createClient({ url: config.REDIS_URL, socket: { connectTimeout: 5_000 } });
    try {
      await client.connect();
      await client.ping();
      await client.quit();
      pass('redis.connection', 'PING OK');
    } catch (err) {
      try { await client.disconnect(); } catch { /* best effort */ }
      fail('redis.connection', err instanceof Error ? err.message : String(err));
    }
  } else {
    fail('redis.connection', 'REDIS_URL not set');
  }

  // ── 5. Kalshi credentials ───────────────────────────────────────────────────
  if (!config) {
    fail('kalshi.creds', 'config not loaded');
  } else {
    const kalshiKey = resolveKalshiKey(config);
    if (!config.KALSHI_KEY_ID) {
      fail('kalshi.creds', 'KALSHI_KEY_ID not set');
    } else if (!kalshiKey) {
      fail('kalshi.creds', 'no key material (KALSHI_PRIVATE_KEY, KALSHI_PRIVATE_KEY_PEM, or KALSHI_PRIVATE_KEY_PATH)');
    } else {
      pass('kalshi.creds', `key_id=[REDACTED] key_material=present`);
    }
  }

  // ── 6. Kalshi balance fetch ─────────────────────────────────────────────────
  if (config) {
    const kalshiKey = resolveKalshiKey(config);
    if (config.KALSHI_KEY_ID && kalshiKey) {
      try {
        const kalshiUrl = getKalshiApiUrl(config);
        const timestamp = String(Date.now());
        const path = '/trade-api/v2/portfolio/balance';
        const sig = signKalshiRequest(kalshiKey, timestamp, 'GET', path);
        const res = await fetch(`${kalshiUrl}/portfolio/balance`, {
          headers: {
            'KALSHI-ACCESS-KEY': config.KALSHI_KEY_ID,
            'KALSHI-ACCESS-TIMESTAMP': timestamp,
            'KALSHI-ACCESS-SIGNATURE': sig
          },
          signal: AbortSignal.timeout(8_000)
        });
        if (res.ok) {
          const data = await res.json() as { balance?: number; portfolio_value?: number };
          const raw = Number(data.balance ?? data.portfolio_value ?? 0);
          const dollars = raw > 1_000 ? raw / 100 : raw;
          pass('kalshi.balance', `$${dollars.toFixed(2)} [key material redacted from output]`);
        } else {
          fail('kalshi.balance', `HTTP ${res.status} ${res.statusText}`);
        }
      } catch (err) {
        fail('kalshi.balance', err instanceof Error ? err.message : String(err));
      }
    } else {
      fail('kalshi.balance', 'credentials missing — skipped');
    }
  }

  // ── 7. Mandate check ────────────────────────────────────────────────────────
  if (config) {
    const mandateId = getEffectiveMandateId(config);
    const mandate = MANDATES[mandateId];
    const bankrollCheck = mandate.bankrollFloor !== undefined && mandate.reserveFloor !== undefined;
    const durationCheck = mandate.marketDurationMinHours !== undefined;
    pass('mandate.active', `${mandateId} reserveFloor=${mandate.reserveFloor ?? 'N/A'} bankrollFloor=${mandate.bankrollFloor ?? 'N/A'} durationFilter=${bankrollCheck && durationCheck ? 'active' : 'default'}`);
  }

  // ── 8. Market duration filter ───────────────────────────────────────────────
  if (config) {
    const mandateId = getEffectiveMandateId(config);
    const mandate = MANDATES[mandateId];
    const minH = mandate.marketDurationMinHours ?? 2;
    const maxH = mandate.marketDurationMaxHours ?? 720;
    pass('scanner.duration', `${minH}–${maxH}h filter active`);
  }

  // ── 9. Live readiness (informational) ──────────────────────────────────────
  if (config) {
    const readiness = liveReadiness(config);
    pass('live.readiness', `ready=${readiness.ready} missing=${Object.keys(readiness.missing).length}`);
  }

  // ── 10. Secrets redaction check ─────────────────────────────────────────────
  if (config) {
    const sensitiveVars = ['KALSHI_PRIVATE_KEY', 'POLYMARKET_PRIVATE_KEY', 'SESSION_SECRET', 'ENCRYPTION_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY'];
    let leaked = false;
    for (const varName of sensitiveVars) {
      const val = process.env[varName];
      if (val && val.length > 8) {
        // Check if this value appears in our own output (it shouldn't — we only emit redacted refs)
        const inOutput = results.some((r) => r.detail.includes(val.slice(0, 12)));
        if (inOutput) { leaked = true; break; }
      }
    }
    if (leaked) {
      fail('secrets.redacted', 'sensitive value detected in preflight output — review logging');
    } else {
      pass('secrets.redacted', 'no sensitive values detected in output');
    }
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  const allOk = results.every((r) => r.ok);
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    console.log(`  ${icon}  ${r.check.padEnd(24)}  ${r.detail}`);
  }
  console.log('');
  if (!allOk) {
    const failed = results.filter((r) => !r.ok).map((r) => r.check).join(', ');
    console.error(`PREFLIGHT FAILED: ${failed}`);
    process.exit(1);
  }
  console.log('PREFLIGHT OK');
}

main().catch((err) => {
  console.error('Preflight error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
