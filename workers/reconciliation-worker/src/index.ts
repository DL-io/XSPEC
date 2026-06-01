import { loadConfig } from '@polyshore/config';
import { createDb, PortfolioRepository, SystemEventRepository } from '@polyshore/db';
import { logInfo } from '@polyshore/observability';
import { reconcile } from '@polyshore/reconciliation';
import { KalshiConnector } from '@polyshore/venues';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const portfolioRepository = new PortfolioRepository(db);
const eventRepository = new SystemEventRepository(db);
const tenantId = process.env.TENANT_ID ?? 'system';
const connector = new KalshiConnector(config.KALSHI_API_URL, config.KALSHI_KEY_ID, config.KALSHI_PRIVATE_KEY, tenantId);

async function reconcileOnce() {
  const local = await portfolioRepository.latest(tenantId);
  if (!local) throw new Error(`No local portfolio snapshot exists for tenant ${tenantId}. Reconciliation cannot run without authoritative local state.`);
  const report = await reconcile(connector, local, tenantId);
  for (const alert of report.alerts) await eventRepository.appendAlert(alert);
  logInfo('reconciliation cycle complete', { mismatches: report.mismatches.length, severe: report.severe, blockNewOrders: report.blockNewOrders });
}

await reconcileOnce();
setInterval(() => {
  reconcileOnce().catch((error) => logInfo('reconciliation cycle failed', { error: error instanceof Error ? error.message : String(error) }));
}, config.RECONCILIATION_SECONDS * 1000);
