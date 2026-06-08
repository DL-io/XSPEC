import { describe, expect, it } from 'vitest';
import type { NewOrder, OrderbookSnapshot, PortfolioState, Position, VenueCancelResult, VenueConnector, VenueOrderResult } from '@polyshore/core';
import { reconcile } from './index';

describe('reconcile', () => {
  it('passes when local orders, positions, balances, and fills match remote venue state', async () => {
    const local = portfolio([{ id: 'pos-1', marketId: 'polymarket:1', side: 'yes', quantity: 5, averagePrice: 0.4, marketValue: 2, category: 'politics', venue: 'polymarket' }]);
    const connector = venueConnector(local, { 'remote-1': { venueOrderId: 'remote-1', clientOrderId: 'client-1', state: 'FILLED', filledQuantity: 1, averagePrice: 0.45 } });

    const report = await reconcile(connector, local, 'tenant-1', {
      localOrders: [{ venueOrderId: 'remote-1', marketId: 'polymarket:1', state: 'FILLED', filledQuantity: 1, averagePrice: 0.45 }],
      localFills: [{ orderId: 'remote-1', marketId: 'polymarket:1', quantity: 1, price: 0.45 }]
    });

    expect(report.severe).toBe(false);
    expect(report.blockNewOrders).toBe(false);
    expect(report.mismatches).toEqual([]);
  });

  it('blocks new orders when a local venue order is missing remotely', async () => {
    const local = portfolio([]);
    const connector = venueConnector(local, {});

    const report = await reconcile(connector, local, 'tenant-1', {
      localOrders: [{ venueOrderId: 'missing-1', marketId: 'polymarket:1', state: 'ACCEPTED_BY_CLOB', filledQuantity: 0 }]
    });

    expect(report.severe).toBe(true);
    expect(report.blockNewOrders).toBe(true);
    expect(report.mismatches).toContainEqual(expect.objectContaining({ entity: 'orders', severity: 'severe', message: 'local order missing remotely' }));
  });
});

function portfolio(positions: Position[]): PortfolioState {
  return {
    tenantId: 'tenant-1',
    cash: 100,
    equity: 110,
    totalExposure: positions.reduce((sum, position) => sum + Math.abs(position.marketValue), 0),
    categoryExposure: {},
    positions,
    openOrderCount: 0,
    dailyPnl: 0,
    maxDrawdown: 0,
    severeMismatchOpen: false
  };
}

function venueConnector(remotePortfolio: PortfolioState, orders: Record<string, VenueOrderResult>): VenueConnector {
  return {
    id: 'polymarket',
    async fetchMarkets() { return []; },
    async fetchOrderbook(_marketId: string): Promise<OrderbookSnapshot> { throw new Error('orderbook fetch is not part of reconciliation'); },
    async placeOrder(_order: NewOrder): Promise<VenueOrderResult> { throw new Error('order placement is not part of reconciliation'); },
    async cancelOrder(orderId: string): Promise<VenueCancelResult> { return { venueOrderId: orderId, confirmed: true }; },
    async fetchPositions() { return remotePortfolio.positions; },
    async fetchPortfolio() { return remotePortfolio; },
    async fetchOrder(orderId: string) { return orders[orderId] ?? null; }
  };
}
