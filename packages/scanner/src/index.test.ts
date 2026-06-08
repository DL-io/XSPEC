import { describe, expect, it } from 'vitest';
import { applyOrderbookSnapshot, evaluateScannerGates } from './index';

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

  it('rejects malformed polymarket token ids and missing executable depth', () => {
    const decision = evaluateScannerGates({
      id: 'polymarket:bad', source: 'polymarket', externalId: 'bad', slug: 'm', question: 'q', resolutionCriteria: 'Official objective criteria resolves this market.', resolutionDate: new Date(Date.now() + 86_400_000), status: 'active',
      bestBid: 0.4, bestAsk: 0.42, spread: 0.02, spreadBps: 500, midpoint: 0.41, lastTradePrice: 0.41,
      bidDepth1Pct: 0, askDepth1Pct: 0, bidDepth5Pct: 0, askDepth5Pct: 0, totalLiquidity: 1000, volume24h: 1000, volume7d: 100,
      openInterest: 0, tradeCount24h: 0, dataFreshnessMs: 1_000, isLiquid: true, hasAmbiguousResolution: false, resolutionAmbiguityScore: 0, category: 'x', tags: [], scannedAt: new Date()
    });
    expect(decision.hardRejectReasons).toContain('malformed Polymarket token id');
    expect(decision.hardRejectReasons).toContain('missing executable top-of-book depth');
  });

  it('normalizes executable prices from sorted orderbook depth', () => {
    const market = {
      id: 'kalshi:m', source: 'kalshi' as const, externalId: 'm', slug: 'm', question: 'q', resolutionCriteria: 'Official objective criteria resolves this market.', resolutionDate: new Date(Date.now() + 86_400_000), status: 'active' as const,
      bestBid: 0.1, bestAsk: 0.9, spread: 0.8, spreadBps: 0, midpoint: 0.5, lastTradePrice: 0.5,
      bidDepth1Pct: 0, askDepth1Pct: 0, bidDepth5Pct: 0, askDepth5Pct: 0, totalLiquidity: 1000, volume24h: 1000, volume7d: 100,
      openInterest: 0, tradeCount24h: 0, dataFreshnessMs: 1_000, isLiquid: true, hasAmbiguousResolution: false, resolutionAmbiguityScore: 0, category: 'x', tags: [], scannedAt: new Date()
    };
    const enriched = applyOrderbookSnapshot(market, { marketId: 'kalshi:m', source: 'kalshi', bids: [{ price: 0.46, size: 100 }, { price: 0.48, size: 100 }], asks: [{ price: 0.52, size: 100 }, { price: 0.5, size: 100 }], capturedAt: new Date() });
    expect(enriched.bestBid).toBe(0.48);
    expect(enriched.bestAsk).toBe(0.5);
  });
});
