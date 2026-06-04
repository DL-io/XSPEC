import { loadConfig } from '@polyshore/config';
import { createDb } from '@polyshore/db';
import { logInfo } from '@polyshore/observability';
import { KalshiConnector } from '@polyshore/venues';
import { processPendingApprovedAudits } from './processor';

const config = loadConfig();
const tenantId = process.env.TENANT_ID ?? 'system';
const db = createDb(config.DATABASE_URL);
const connector = new KalshiConnector(config.KALSHI_API_URL, config.KALSHI_KEY_ID, config.KALSHI_PRIVATE_KEY, tenantId);

async function executeOnce() {
  const results = await processPendingApprovedAudits(db, { tenantId, mode: config.OPERATING_MODE, connector });
  logInfo('execution cycle complete', { processed: results.length, mode: config.OPERATING_MODE });
}

logInfo('execution worker ready', { mode: config.OPERATING_MODE });
await executeOnce();
setInterval(() => {
  executeOnce().catch((error) => logInfo('execution cycle failed', { error: error instanceof Error ? error.message : String(error) }));
}, 5_000);
