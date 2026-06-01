import type { EnsembleResult, NormalizedMarket, PortfolioState, Side, TradeProposal } from '@polyshore/core';
import { MANDATES } from '@polyshore/risk';

export function calculateEdge(market: NormalizedMarket, ensemble: EnsembleResult) {
  const yesEdge = ensemble.ensembleProbability - market.bestAsk;
  const noEdge = (1 - ensemble.ensembleProbability) - (1 - market.bestBid);
  const side: Side = yesEdge >= noEdge ? 'yes' : 'no';
  const bestEdge = Math.max(yesEdge, noEdge);
  const executionCost = market.spread / 2;
  const adjustedEdge = bestEdge - executionCost;
  const penalizedEdge = adjustedEdge * (1 - ensemble.ensembleUncertainty);
  return { yesEdge, noEdge, side, bestEdge, executionCost, adjustedEdge, penalizedEdge };
}

export function opportunityScore(input: { penalizedEdge: number; ensembleConfidence: number; liquidityScore: number; daysToResolution: number; ensembleUncertainty: number }): number {
  return input.penalizedEdge * 0.40 + input.ensembleConfidence * 0.25 + input.liquidityScore * 0.15 + (1 / Math.max(input.daysToResolution, 0.25)) * 0.10 + (1 - input.ensembleUncertainty) * 0.10;
}

export function proposeTrade(market: NormalizedMarket, ensemble: EnsembleResult, portfolio: PortfolioState, mandateId: keyof typeof MANDATES): TradeProposal {
  const edge = calculateEdge(market, ensemble);
  const price = edge.side === 'yes' ? market.bestAsk : 1 - market.bestBid;
  const b = Math.max(0.01, (1 - price) / price);
  const p = edge.side === 'yes' ? ensemble.ensembleProbability : 1 - ensemble.ensembleProbability;
  const q = 1 - p;
  const kelly = Math.max(0, (b * p - q) / b) * MANDATES[mandateId].fractionalKelly;
  const mandateCap = portfolio.equity * MANDATES[mandateId].maxSingleMarketExposure;
  const liquidityCap = market.totalLiquidity * 0.05;
  const suggestedSize = Math.min(portfolio.cash, mandateCap, liquidityCap, portfolio.equity * kelly);
  const daysToResolution = (market.resolutionDate.getTime() - Date.now()) / 86_400_000;
  return {
    marketId: market.id,
    side: edge.side,
    edge: edge.bestEdge,
    adjustedEdge: edge.adjustedEdge,
    penalizedEdge: edge.penalizedEdge,
    opportunityScore: opportunityScore({ penalizedEdge: edge.penalizedEdge, ensembleConfidence: ensemble.ensembleConfidence, liquidityScore: Math.min(1, market.totalLiquidity / 10_000), daysToResolution, ensembleUncertainty: ensemble.ensembleUncertainty }),
    suggestedSize,
    limitPrice: price,
    ensemble
  };
}
