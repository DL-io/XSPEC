import { loadConfig } from '@polyshore/config';
import { createDb } from '@polyshore/db';
import { logInfo } from '@polyshore/observability';
import { KalshiConnector, PolymarketConnector } from '@polyshore/venues';
import { processPendingApprovedAudits } from './processor';

const config = loadConfig();
const tenantId = process.env.TENANT_ID ?? 'system';
const db = createDb(config.DATABASE_URL);
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
  logInfo('execution cycle complete', { processed: results.length, mode: config.OPERATING_MODE });
}

logInfo('execution worker ready', { mode: config.OPERATING_MODE });
await executeOnce();
if (process.env.WORKER_ONCE === 'true') {
  logInfo('execution worker one-shot complete', { mode: config.OPERATING_MODE });
} else {
  setInterval(() => {
    executeOnce().catch((error) => logInfo('execution cycle failed', { error: error instanceof Error ? error.message : String(error) }));
  }, 5_000);
}
