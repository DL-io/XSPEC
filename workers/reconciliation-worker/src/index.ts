import { loadConfig } from '@polyshore/config';
import { createDb, DecisionAuditRepository, OrderRepository, PortfolioRepository, PositionRepository, ReconciliationIncidentRepository, SystemEventRepository } from '@polyshore/db';
import { logInfo } from '@polyshore/observability';
import { reconcile, reconciliationAuditStatus } from '@polyshore/reconciliation';
import { KalshiConnector } from '@polyshore/venues';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const tenantId = process.env.TENANT_ID ?? 'system';
const portfolioRepository = new PortfolioRepository(db);
const positionRepository = new PositionRepository(db);
const orderRepository = new OrderRepository(db, tenantId);
const incidentRepository = new ReconciliationIncidentRepository(db);
const eventRepository = new SystemEventRepository(db);
const auditRepository = new DecisionAuditRepository(db);
const connector = new KalshiConnector(config.KALSHI_API_URL, config.KALSHI_KEY_ID, config.KALSHI_PRIVATE_KEY, tenantId);

async function reconcileOnce() {
  const local = await portfolioRepository.latest(tenantId);
  if (!local) throw new Error(`No local portfolio snapshot exists for tenant ${tenantId}. Reconciliation cannot run without authoritative local state.`);
  const localPositions = await positionRepository.listForTenant(tenantId);
  const localOrders = await orderRepository.listForReconciliation();
  const localFills = (await auditRepository.latestForTenant(tenantId, 100))
    .filter((audit) => audit.executionResult && audit.executionResult.filledQuantity > 0 && audit.executionResult.averagePrice)
    .map((audit) => ({
      orderId: audit.executionResult?.venueOrderId ?? audit.id,
      marketId: audit.marketId,
      quantity: audit.executionResult?.filledQuantity ?? 0,
      price: audit.executionResult?.averagePrice ?? 0
    }));
  const openIncident = await incidentRepository.state(tenantId);
  const localState = { ...local, positions: localPositions, openOrderCount: localOrders.length, severeMismatchOpen: openIncident.severeMismatchOpen };
  const report = await reconcile(connector, localState, tenantId, { localOrders, localFills });
  const state = await incidentRepository.persistReport(tenantId, report);
  await portfolioRepository.markSevereMismatch(tenantId, state.severeMismatchOpen);
  const status = reconciliationAuditStatus(report);
  const audits = await auditRepository.latestForTenant(tenantId, 25);
  for (const audit of audits) await auditRepository.markReconciliationStatus(audit.id, status);
  for (const alert of report.alerts) await eventRepository.appendAlert(alert);
  logInfo('reconciliation cycle complete', { mismatches: report.mismatches.length, severe: report.severe, blockNewOrders: report.blockNewOrders });
}

await reconcileOnce();
setInterval(() => {
  reconcileOnce().catch((error) => logInfo('reconciliation cycle failed', { error: error instanceof Error ? error.message : String(error) }));
}, config.RECONCILIATION_SECONDS * 1000);
