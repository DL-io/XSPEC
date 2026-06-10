import type { FeatureSnapshot, NormalizedMarket } from '@polyshore/core';
export * from './store';

export function computeFeatureSnapshot(market: NormalizedMarket, window: FeatureSnapshot['window']): FeatureSnapshot {
  const volatility = Math.min(1, market.spread * 10);
  const momentum = market.lastTradePrice - market.midpoint;
  const spreadRegime = market.spread > 0.02 ? 'wide' : market.spread > 0.01 ? 'normal' : 'tight';
  const orderFlowImbalance = (market.bidDepth1Pct - market.askDepth1Pct) / Math.max(1, market.bidDepth1Pct + market.askDepth1Pct);
  const volumeBurstScore = market.volume24h / Math.max(1, market.volume7d / 7);
  const catalystProximity = Math.max(0, 1 - (market.resolutionDate.getTime() - Date.now()) / 604_800_000);

  // directional order flow pressure amplified by above-average volume activity
  const sentimentVelocity = orderFlowImbalance * Math.max(0, volumeBurstScore - 1);

  // momentum in tight-spread markets is more likely to reflect systematic co-movement;
  // attenuated by spread quality as a proxy for how much professional liquidity is present
  const spreadQuality = spreadRegime === 'tight' ? 1.0 : spreadRegime === 'normal' ? 0.5 : 0.15;
  const crossMarketCorrelationScore = Math.tanh(momentum * 10) * spreadQuality;

  const macroRegimeLabel = classifyRegime({ volatility, momentum, spreadRegime, volumeBurstScore, catalystProximity });

  return {
    marketId: market.id,
    window,
    volatility,
    momentum,
    spreadRegime,
    orderFlowImbalance,
    volumeBurstScore,
    sentimentVelocity,
    crossMarketCorrelationScore,
    catalystProximity,
    macroRegimeLabel,
    computedAt: new Date()
  };
}

function classifyRegime(f: { volatility: number; momentum: number; spreadRegime: string; volumeBurstScore: number; catalystProximity: number }): string {
  if (f.catalystProximity > 0.7 || f.volumeBurstScore > 2.5) return 'event_driven';
  if (f.volatility > 0.2 || f.spreadRegime === 'wide') return 'high_volatility';
  if (f.momentum > 0.01 && f.volumeBurstScore >= 1.2 && f.spreadRegime !== 'wide') return 'trending_up';
  if (f.momentum < -0.01 && f.volumeBurstScore >= 1.2 && f.spreadRegime !== 'wide') return 'trending_down';
  if (f.volatility < 0.03 && f.spreadRegime === 'tight' && f.volumeBurstScore < 0.8) return 'low_volatility';
  if (Math.abs(f.momentum) < 0.005 && f.volumeBurstScore < 0.8) return 'mean_reverting';
  return 'normal';
}
