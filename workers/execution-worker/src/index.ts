import { loadConfig } from '@polyshore/config';
import { createDb, WorkerHealthRepository } from '@polyshore/db';
import { logInfo } from '@polyshore/observability';
import { KalshiConnector, PolymarketConnector } from '@polyshore/venues';
import { processPendingApprovedAudits } from './processor';

const config = loadConfig();
const tenantId = process.env.TENANT_ID ?? 'system';
const db = createDb(config.DATABASE_URL);
const health = new WorkerHealthRepository(db);
const connectors = {
  kalshi: new KalshiConnector(config.KALSHI_API_URL, config.KALSHI_KEY_ID, config.KALSHI_PRIVATE_KEY, tenantId),
  polymarket: new PolymarketConnector(config.POLYMARKET_GAMMA_URL, config.POLYMARKET_CLOB_URL, tenantId, {
    privateKey: config.POLYMARKET_PRIVATE_KEY,
    creds: config.POLYMARKET_API_KEY && config.POLYMARKET_SECRET && config.POLYMARKET_PASSPHRASE
      ? { key: config.POLYMARKET_API_KEY, secret: config.POLYMARKET_SECRET, passphrase: config.POLYMARKET_PASSPHRASE }
      : undefined,
    funderAddress: config.POLYMARKET_FUNDER_ADDRESS,
    signatureType: config.POLYMARKET_SIGNATURE_TYPE,
    chainId: config.POLYMARKET_CHAIN_ID
  })
};

async function executeOnce() {
  const results = await processPendingApprovedAudits(db, { tenantId, mode: config.OPERATING_MODE, connectors, runtimeConfig: config });
  await health.heartbeat({ worker: 'execution-worker', status: 'ok', lastHeartbeatAt: new Date(), lastSuccessAt: new Date(), metadata: { processed: results.length, mode: config.OPERATING_MODE } });
  logInfo('execution cycle complete', { processed: results.length, mode: config.OPERATING_MODE });
}

logInfo('execution worker ready', { mode: config.OPERATING_MODE });
if (process.env.WORKER_ONCE === 'true') {
  await executeOnce();
  logInfo('execution worker one-shot complete', { mode: config.OPERATING_MODE });
} else {
  await loop('execution-worker', executeOnce);
}

async function loop(worker: string, run: () => Promise<void>) {
  let backoffMs = 1_000;
  for (;;) {
    try {
      await run();
      backoffMs = 1_000;
      await sleep(5_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await health.heartbeat({ worker, status: 'error', lastHeartbeatAt: new Date(), lastError: message });
      logInfo(`${worker} cycle failed`, { error: message, backoffMs });
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 60_000);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
