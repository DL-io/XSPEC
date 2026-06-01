import type { FeatureSnapshot, NormalizedMarket } from '@polyshore/core';

export function computeFeatureSnapshot(market: NormalizedMarket, window: FeatureSnapshot['window']): FeatureSnapshot {
  return {
    marketId: market.id,
    window,
    volatility: Math.min(1, market.spread * 10),
    momentum: market.lastTradePrice - market.midpoint,
    spreadRegime: market.spread > 0.02 ? 'wide' : market.spread > 0.01 ? 'normal' : 'tight',
    orderFlowImbalance: (market.bidDepth1Pct - market.askDepth1Pct) / Math.max(1, market.bidDepth1Pct + market.askDepth1Pct),
    volumeBurstScore: market.volume24h / Math.max(1, market.volume7d / 7),
    sentimentVelocity: 0,
    crossMarketCorrelationScore: 0,
    catalystProximity: Math.max(0, 1 - (market.resolutionDate.getTime() - Date.now()) / 604_800_000),
    macroRegimeLabel: 'unclassified',
    computedAt: new Date()
  };
}
