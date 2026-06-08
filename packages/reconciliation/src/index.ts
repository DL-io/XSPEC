import type { AlertEvent, PortfolioState, ReconciliationAuditStatus, ReconciliationSeverity, VenueConnector } from '@polyshore/core';

export interface LocalOrderReconciliationItem { venueOrderId: string; marketId: string; state: string; filledQuantity: number; averagePrice?: number; }
export interface LocalFillReconciliationItem { orderId: string; marketId: string; quantity: number; price: number; }
export interface ReconciliationInput {
  localOrders?: LocalOrderReconciliationItem[];
  localFills?: LocalFillReconciliationItem[];
}
export interface ReconciliationMismatch { entity: 'orders' | 'fills' | 'positions' | 'balances' | 'cash' | 'exposure'; severity: ReconciliationSeverity; message: string; local?: unknown; remote?: unknown; }
export interface ReconciliationReport { checkedAt: Date; mismatches: ReconciliationMismatch[]; severe: boolean; blockNewOrders: boolean; alerts: AlertEvent[]; }

export async function reconcile(connector: VenueConnector, local: PortfolioState, tenantId: string, input: ReconciliationInput = {}): Promise<ReconciliationReport> {
  const remote = await connector.fetchPortfolio();
  const mismatches: ReconciliationMismatch[] = [];
  compareNumber('cash', local.cash, remote.cash, mismatches);
  compareNumber('balances', local.equity, remote.equity, mismatches);
  compareNumber('exposure', local.totalExposure, remote.totalExposure, mismatches);
  if (local.openOrderCount !== remote.openOrderCount) mismatches.push({ entity: 'orders', severity: 'moderate', message: 'open order count mismatch', local: local.openOrderCount, remote: remote.openOrderCount });
  if (local.positions.length !== remote.positions.length) mismatches.push({ entity: 'positions', severity: 'moderate', message: 'position count mismatch', local: local.positions.length, remote: remote.positions.length });
  comparePositions(local, remote, mismatches);
  await compareOrders(connector, input.localOrders ?? [], mismatches);
  compareFills(input.localFills ?? [], mismatches);
  const severe = mismatches.some((m) => m.severity === 'severe') || remote.severeMismatchOpen;
  return {
    checkedAt: new Date(),
    mismatches,
    severe,
    blockNewOrders: severe,
    alerts: severe ? [{ id: `alert:${Date.now()}`, tenantId, severity: 'critical', channel: 'in_app', eventType: 'severe_reconciliation_mismatch', message: 'Severe reconciliation mismatch blocks new orders until manual acknowledgment.', createdAt: new Date() }] : []
  };
}

export function reconciliationAuditStatus(report: ReconciliationReport): ReconciliationAuditStatus {
  return {
    checkedAt: report.checkedAt,
    severe: report.severe,
    blockNewOrders: report.blockNewOrders,
    mismatchCount: report.mismatches.length,
    severeReasons: report.mismatches.filter((m) => m.severity === 'severe').map((m) => m.message)
  };
}

function compareNumber(entity: 'cash' | 'balances' | 'exposure', local: number, remote: number, mismatches: ReconciliationMismatch[]) {
  const delta = Math.abs(local - remote);
  if (delta === 0) return;
  const severity: ReconciliationSeverity = delta > Math.max(100, Math.abs(remote) * 0.02) ? 'severe' : 'minor';
  mismatches.push({ entity, severity, message: `${entity} mismatch`, local, remote });
}

function comparePositions(local: PortfolioState, remote: PortfolioState, mismatches: ReconciliationMismatch[]) {
  const remotePositions = new Map(remote.positions.map((position) => [`${position.venue}:${position.marketId}:${position.side}`, position]));
  for (const position of local.positions) {
    const remotePosition = remotePositions.get(`${position.venue}:${position.marketId}:${position.side}`);
    if (!remotePosition) {
      mismatches.push({ entity: 'positions', severity: 'severe', message: 'local position missing remotely', local: position });
      continue;
    }
    compareNumber('exposure', position.marketValue, remotePosition.marketValue, mismatches);
    if (Math.abs(position.quantity - remotePosition.quantity) > 0.000001) {
      mismatches.push({ entity: 'positions', severity: 'severe', message: 'position quantity mismatch', local: position.quantity, remote: remotePosition.quantity });
    }
  }
}

async function compareOrders(connector: VenueConnector, localOrders: LocalOrderReconciliationItem[], mismatches: ReconciliationMismatch[]) {
  for (const order of localOrders) {
    const remote = await connector.fetchOrder(order.venueOrderId);
    if (!remote) {
      mismatches.push({ entity: 'orders', severity: 'severe', message: 'local order missing remotely', local: order });
      continue;
    }
    if (remote.state !== order.state) mismatches.push({ entity: 'orders', severity: 'moderate', message: 'order state mismatch', local: order.state, remote: remote.state });
    if (Math.abs(remote.filledQuantity - order.filledQuantity) > 0.000001) mismatches.push({ entity: 'fills', severity: 'severe', message: 'filled quantity mismatch', local: order.filledQuantity, remote: remote.filledQuantity });
  }
}

function compareFills(localFills: LocalFillReconciliationItem[], mismatches: ReconciliationMismatch[]) {
  for (const fill of localFills) {
    if (!Number.isFinite(fill.quantity) || fill.quantity <= 0 || !Number.isFinite(fill.price) || fill.price <= 0 || fill.price >= 1) {
      mismatches.push({ entity: 'fills', severity: 'severe', message: 'invalid local fill record', local: fill });
    }
  }
}
