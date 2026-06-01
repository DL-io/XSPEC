import type { AlertEvent, PortfolioState, ReconciliationSeverity, VenueConnector } from '@polyshore/core';

export interface ReconciliationMismatch { entity: 'orders' | 'fills' | 'positions' | 'cash' | 'exposure'; severity: ReconciliationSeverity; message: string; local?: unknown; remote?: unknown; }
export interface ReconciliationReport { checkedAt: Date; mismatches: ReconciliationMismatch[]; severe: boolean; blockNewOrders: boolean; alerts: AlertEvent[]; }

export async function reconcile(connector: VenueConnector, local: PortfolioState, tenantId: string): Promise<ReconciliationReport> {
  const remote = await connector.fetchPortfolio();
  const mismatches: ReconciliationMismatch[] = [];
  compareNumber('cash', local.cash, remote.cash, mismatches);
  compareNumber('exposure', local.totalExposure, remote.totalExposure, mismatches);
  if (local.openOrderCount !== remote.openOrderCount) mismatches.push({ entity: 'orders', severity: 'moderate', message: 'open order count mismatch', local: local.openOrderCount, remote: remote.openOrderCount });
  if (local.positions.length !== remote.positions.length) mismatches.push({ entity: 'positions', severity: 'moderate', message: 'position count mismatch', local: local.positions.length, remote: remote.positions.length });
  const severe = mismatches.some((m) => m.severity === 'severe') || remote.severeMismatchOpen;
  return {
    checkedAt: new Date(),
    mismatches,
    severe,
    blockNewOrders: severe,
    alerts: severe ? [{ id: `alert:${Date.now()}`, tenantId, severity: 'critical', channel: 'in_app', eventType: 'severe_reconciliation_mismatch', message: 'Severe reconciliation mismatch blocks new orders until manual acknowledgment.', createdAt: new Date() }] : []
  };
}

function compareNumber(entity: 'cash' | 'exposure', local: number, remote: number, mismatches: ReconciliationMismatch[]) {
  const delta = Math.abs(local - remote);
  if (delta === 0) return;
  const severity: ReconciliationSeverity = delta > Math.max(100, Math.abs(remote) * 0.02) ? 'severe' : 'minor';
  mismatches.push({ entity, severity, message: `${entity} mismatch`, local, remote });
}
