import { describe, expect, it } from 'vitest';
import { evaluateScannerGates } from './index';

describe('scanner gates', () => {
  it('rejects stale and illiquid markets', () => {
    const decision = evaluateScannerGates({
      id: 'm', source: 'kalshi', externalId: 'm', slug: 'm', question: 'q', resolutionCriteria: 'clear', resolutionDate: new Date(Date.now() + 86_400_000), status: 'active',
      bestBid: 0.4, bestAsk: 0.42, spread: 0.02, spreadBps: 500, midpoint: 0.41, lastTradePrice: 0.41,
      bidDepth1Pct: 10, askDepth1Pct: 10, bidDepth5Pct: 10, askDepth5Pct: 10, totalLiquidity: 100, volume24h: 100, volume7d: 100,
      openInterest: 0, tradeCount24h: 0, dataFreshnessMs: 31_000, isLiquid: false, hasAmbiguousResolution: false, resolutionAmbiguityScore: 0, category: 'x', tags: [], scannedAt: new Date()
    });
    expect(decision.accepted).toBe(false);
  });
});
