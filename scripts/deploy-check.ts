import { liveReadiness, loadConfig, validateConfigFromEnvFile } from '@polyshore/config';
import { createDb } from '@polyshore/db';
import { RISK_GATE_ORDER } from '@polyshore/risk';
import { createClient } from 'redis';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
let hasFailure = false;

function ok(name: string, detail: string) { checks.push({ name, ok: true, detail }); }
function fail(name: string, detail: string) { checks.push({ name, ok: false, detail }); hasFailure = true; }

async function main() {
  // ─── Config validation ────────────────────────────────────────────────────────
  let runtimeConfig: ReturnType<typeof loadConfig> | undefined;
  try {
    const result = validateConfigFromEnvFile();
    runtimeConfig = loadConfig();
    ok('config:env', `mode=${result.operatingMode} envFile=${result.envFileLoaded}`);
  } catch (e) {
    fail('config:env', e instanceof Error ? e.message : String(e));
    try { runtimeConfig = loadConfig(); } catch (_) { /* best effort */ }
  }

  // ─── Required env vars ──────────────────────────────────────────────────────
  const required = ['DATABASE_URL', 'REDIS_URL', 'SESSION_SECRET', 'ENCRYPTION_KEY'] as const;
  for (const key of required) {
    const val = process.env[key];
    if (!val || val.includes('localhost') || val.includes('user:pass@') || val.includes('change_me')) {
      fail(`config:${key}`, 'missing or placeholder value');
    } else {
      ok(`config:${key}`, 'set');
    }
  }

  // ─── Database connectivity ──────────────────────────────────────────────────
  if (runtimeConfig?.DATABASE_URL) {
    const db = createDb(runtimeConfig.DATABASE_URL);
    try {
      await db.execute('SELECT 1');
      ok('db:connect', 'ok');

      const dbName = new URL(runtimeConfig.DATABASE_URL.replace('mysql://', 'http://')).pathname.slice(1);
      const result = await db.execute(
        `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = '${dbName}' AND table_name != '__drizzle_migrations'`
      ) as unknown as [[Record<string, unknown>], unknown[]];
      const count = Number(result[0][0]?.n ?? 0);
      if (count < 25) {
        fail('db:tables', `expected ≥25 app tables, got ${count} — run pnpm db:migrate`);
      } else {
        ok('db:tables', `${count} app tables`);
      }
    } catch (e) {
      fail('db:connect', e instanceof Error ? e.message : String(e));
      fail('db:tables', 'skipped — DB not reachable');
    }
  } else {
    fail('db:connect', 'DATABASE_URL not set');
    fail('db:tables', 'skipped');
  }

  // ─── Redis connectivity ─────────────────────────────────────────────────────
  if (runtimeConfig?.REDIS_URL) {
    try {
      const redis = createClient({ url: runtimeConfig.REDIS_URL });
      redis.on('error', () => undefined);
      await redis.connect();
      const pong = await redis.ping();
      await redis.quit();
      if (pong !== 'PONG') {
        fail('redis:ping', `expected PONG, got ${pong}`);
      } else {
        ok('redis:ping', 'PONG');
      }
    } catch (e) {
      fail('redis:ping', e instanceof Error ? e.message : String(e));
    }
  } else {
    fail('redis:ping', 'REDIS_URL not set');
  }

  // ─── Risk fortress ──────────────────────────────────────────────────────────
  if (RISK_GATE_ORDER.length === 16) {
    ok('risk:gates', '16 gates registered');
  } else {
    fail('risk:gates', `expected 16 gates, got ${RISK_GATE_ORDER.length}`);
  }

  // ─── Worker scripts ─────────────────────────────────────────────────────────
  const workers = [
    'scanner-worker',
    'research-worker',
    'execution-worker',
    'reconciliation-worker',
    'calibration-worker',
    'alert-worker'
  ];
  const root = resolve(__dirname, '..');
  for (const w of workers) {
    const entryTs = resolve(root, 'workers', w, 'src', 'index.ts');
    const pkgJson = resolve(root, 'workers', w, 'package.json');
    if (!existsSync(entryTs)) {
      fail(`worker:${w}`, 'src/index.ts not found');
    } else if (!existsSync(pkgJson)) {
      fail(`worker:${w}`, 'package.json not found');
    } else {
      ok(`worker:${w}`, 'entry exists');
    }
  }

  // ─── Terminal app ───────────────────────────────────────────────────────────
  const terminalDir = resolve(root, 'apps', 'terminal');
  const nextConfig = resolve(terminalDir, 'next.config.ts');
  if (existsSync(nextConfig)) {
    ok('terminal:app', 'next.config.ts present');
  } else {
    fail('terminal:app', 'next.config.ts not found');
  }

  // ─── Migration journal ──────────────────────────────────────────────────────
  const journal = resolve(root, 'packages', 'db', 'migrations', 'meta', '_journal.json');
  if (existsSync(journal)) {
    try {
      const { entries } = JSON.parse(readFileSync(journal, 'utf8')) as { entries: { idx: number }[] };
      ok('db:migrations', `${entries.length} migration(s) in journal`);
    } catch (_) {
      fail('db:migrations', 'could not parse _journal.json');
    }
  } else {
    fail('db:migrations', '_journal.json not found');
  }

  // ─── Live readiness ─────────────────────────────────────────────────────────
  if (runtimeConfig) {
    const lr = liveReadiness(runtimeConfig);
    ok('mode:paper', `paperReady=${runtimeConfig.OPERATING_MODE === 'paper'}`);
    if (lr.ready) {
      ok('mode:live', 'all live keys configured');
    } else {
      const missingCount = Object.keys(lr.missing).length;
      ok('mode:live', `not configured (${missingCount} missing) — paper mode only`);
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log('\n=== deploy:check results ===');
  for (const c of checks) {
    console.log(`[${c.ok ? 'PASS' : 'FAIL'}] ${c.name} — ${c.detail}`);
  }
  const passed = checks.filter(c => c.ok).length;
  const failed = checks.filter(c => !c.ok).length;
  console.log(`\n${passed} passed, ${failed} failed`);

  if (hasFailure) {
    console.error('\ndeploy:check FAILED — system is not ready for deployment');
    process.exit(1);
  } else {
    console.log('\ndeploy:check PASSED — system is deployment ready');
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('deploy:check fatal error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
