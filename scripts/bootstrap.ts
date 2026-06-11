/**
 * Bootstrap: ensures the system tenant, safety state, and operator API client
 * exist in the database. Safe to run on every startup — idempotent.
 *
 * Run: pnpm bootstrap
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { loadConfig } from '@polyshore/config';
import { createDb, ApiClientRepository, ApiKeyRepository, ConfigOverrideRepository, TenantRepository, hashApiKey } from '@polyshore/db';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
loadDotenv({ path: resolve(ROOT, '.env'), override: false });

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? 'system';
const ENV_FILE = resolve(ROOT, '.env');

function log(icon: string, msg: string) { process.stdout.write(`  ${icon}  ${msg}\n`); }

async function bootstrap() {
  const config = loadConfig();
  const db = createDb(config.DATABASE_URL);

  // 1. Tenant
  const tenantRepo = new TenantRepository(db);
  const existing = await tenantRepo.get(TENANT_ID);
  if (!existing) {
    await tenantRepo.put({ id: TENANT_ID, name: 'System Operator', plan: 'private_operator', liveEnabled: false, createdAt: new Date() });
    log('✓', `Created tenant: ${TENANT_ID}`);
  } else {
    log('·', `Tenant exists: ${TENANT_ID}`);
  }

  // 2. Safety state — initialize kill switch as armed (safe default for paper mode)
  const configRepo = new ConfigOverrideRepository(db);
  const overrides = await configRepo.listForTenant(TENANT_ID);
  const killSwitchExists = overrides.some((o) => o.key === 'safety.kill_switch');
  if (!killSwitchExists) {
    await configRepo.append({
      id: randomBytes(8).toString('hex'),
      tenantId: TENANT_ID,
      key: 'safety.kill_switch',
      value: { active: true, reason: 'initialized at bootstrap', armedAt: new Date().toISOString() },
      actorId: 'bootstrap',
      changedAt: new Date()
    });
    log('✓', 'Safety state initialized (kill switch armed — paper mode)');
  } else {
    log('·', 'Safety state exists');
  }

  // 3. Operator API client + key
  const clientRepo = new ApiClientRepository(db);
  const clients = await clientRepo.listForTenant(TENANT_ID);
  const operatorClient = clients.find((c) => c.name === 'local-operator');

  if (!operatorClient) {
    const clientId = `local-operator-${TENANT_ID}`;
    await clientRepo.put({ id: clientId, tenantId: TENANT_ID, name: 'local-operator', scopes: ['*'], rateLimitPerMinute: 300 });

    const rawKey = `xsk_${randomBytes(24).toString('hex')}`;
    const keyRepo = new ApiKeyRepository(db);
    await keyRepo.put({ id: randomBytes(8).toString('hex'), apiClientId: clientId, keyHash: hashApiKey(rawKey), createdAt: new Date() });

    if (existsSync(ENV_FILE)) {
      const envContent = readFileSync(ENV_FILE, 'utf8');
      if (!envContent.includes('NEXT_PUBLIC_OPERATOR_API_KEY=')) {
        writeFileSync(ENV_FILE, `${envContent.trimEnd()}\nNEXT_PUBLIC_OPERATOR_API_KEY=${rawKey}\n`);
        log('✓', `API key written to .env: ${rawKey.slice(0, 16)}…`);
      }
    }
    log('✓', 'Operator API client created');
  } else {
    log('·', 'Operator API client exists');
  }

  log('✓', 'Bootstrap complete');
  process.exit(0);
}

bootstrap().catch((err) => {
  process.stderr.write(`Bootstrap failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
