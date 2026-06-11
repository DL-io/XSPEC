import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { liveReadiness, loadConfig } from '@polyshore/config';
import { RISK_GATE_ORDER } from '@polyshore/risk';
import { createClient } from 'redis';
import mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from repo root so preflight works standalone (not just inside pm2)
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
    if (RISK_GATE_ORDER.length !== 16) throw new Error(`expected 16 gates, got ${RISK_GATE_ORDER.length}`);
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

  // ── 5. Live readiness (informational) ──────────────────────────────────────
  if (config) {
    const readiness = liveReadiness(config);
    pass('live.readiness', `ready=${readiness.ready} missing=${Object.keys(readiness.missing).length}`);
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  const allOk = results.every((r) => r.ok);
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    console.log(`  ${icon}  ${r.check.padEnd(22)}  ${r.detail}`);
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
