import { loadConfig } from '@polyshore/config';
import { createDb, DecisionAuditRepository, OrderRepository, PortfolioRepository, PositionRepository, ReconciliationIncidentRepository, SystemEventRepository } from '@polyshore/db';
import { logInfo } from '@polyshore/observability';
import { reconcile, reconciliationAuditStatus } from '@polyshore/reconciliation';
import { KalshiConnector, PolymarketConnector } from '@polyshore/venues';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const tenantId = process.env.TENANT_ID ?? 'system';
const portfolioRepository = new PortfolioRepository(db);
const positionRepository = new PositionRepository(db);
const orderRepository = new OrderRepository(db, tenantId);
const incidentRepository = new ReconciliationIncidentRepository(db);
const eventRepository = new SystemEventRepository(db);
const auditRepository = new DecisionAuditRepository(db);
const connectors = [
  new KalshiConnector(config.KALSHI_API_URL, config.KALSHI_KEY_ID, config.KALSHI_PRIVATE_KEY, tenantId),
  new PolymarketConnector(config.POLYMARKET_GAMMA_URL, config.POLYMARKET_CLOB_URL, tenantId, {
    privateKey: config.POLYMARKET_PRIVATE_KEY,
    creds: config.POLYMARKET_API_KEY && config.POLYMARKET_SECRET && config.POLYMARKET_PASSPHRASE
      ? { key: config.POLYMARKET_API_KEY, secret: config.POLYMARKET_SECRET, passphrase: config.POLYMARKET_PASSPHRASE }
      : undefined,
    funderAddress: config.POLYMARKET_FUNDER_ADDRESS,
    signatureType: config.POLYMARKET_SIGNATURE_TYPE,
    chainId: config.POLYMARKET_CHAIN_ID
  })
];

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
  const audits = await auditRepository.latestForTenant(tenantId, 25);
  let severeMismatchOpen = openIncident.severeMismatchOpen;
  let successfulVenues = 0;
  let totalMismatches = 0;

  for (const connector of connectors) {
    const venuePositions = localPositions.filter((position) => position.venue === connector.id);
    const venueOrders = localOrders.filter((order) => order.marketId.startsWith(`${connector.id}:`));
    const venueFills = localFills.filter((fill) => fill.marketId.startsWith(`${connector.id}:`));
    const localState = {
      ...local,
      positions: venuePositions,
      openOrderCount: venueOrders.length,
      totalExposure: venuePositions.reduce((sum, position) => sum + Math.abs(position.marketValue), 0),
      severeMismatchOpen
    };

    try {
      const report = await reconcile(connector, localState, tenantId, { localOrders: venueOrders, localFills: venueFills });
      const state = await incidentRepository.persistReport(tenantId, report);
      severeMismatchOpen = state.severeMismatchOpen;
      const status = reconciliationAuditStatus(report);
      for (const audit of audits.filter((audit) => audit.marketId.startsWith(`${connector.id}:`))) await auditRepository.markReconciliationStatus(audit.id, status);
      for (const alert of report.alerts) await eventRepository.appendAlert(alert);
      successfulVenues += 1;
      totalMismatches += report.mismatches.length;
      logInfo('venue reconciliation complete', { venue: connector.id, mismatches: report.mismatches.length, severe: report.severe, blockNewOrders: report.blockNewOrders });
    } catch (error) {
      logInfo('venue reconciliation failed', { venue: connector.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (successfulVenues === 0) throw new Error('No venue reconciliation cycle completed successfully.');
  await portfolioRepository.markSevereMismatch(tenantId, severeMismatchOpen);
  logInfo('reconciliation cycle complete', { venues: successfulVenues, mismatches: totalMismatches, severeMismatchOpen });
}

await reconcileOnce();
if (process.env.WORKER_ONCE === 'true') {
  logInfo('reconciliation worker one-shot complete', { mode: config.OPERATING_MODE });
} else {
  setInterval(() => {
    reconcileOnce().catch((error) => logInfo('reconciliation cycle failed', { error: error instanceof Error ? error.message : String(error) }));
  }, config.RECONCILIATION_SECONDS * 1000);
}
