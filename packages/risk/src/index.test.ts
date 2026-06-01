import { describe, expect, it } from 'vitest';
import type { NormalizedMarket, PortfolioState, TradeProposal } from '@polyshore/core';
import { evaluateRisk, RISK_GATE_ORDER, type RiskContext } from './index';

const market: NormalizedMarket = {
  id: 'market', source: 'polymarket', externalId: 'external', slug: 'market', question: 'Will the event happen?',
  resolutionCriteria: 'The official source resolves the event.', resolutionDate: new Date(Date.now() + 7 * 86_400_000), status: 'active',
  bestBid: 0.45, bestAsk: 0.48, spread: 0.03, spreadBps: 645, midpoint: 0.465, lastTradePrice: 0.46,
  bidDepth1Pct: 500, askDepth1Pct: 500, bidDepth5Pct: 1000, askDepth5Pct: 1000, totalLiquidity: 10_000, volume24h: 2_000,
  volume7d: 12_000, openInterest: 5_000, tradeCount24h: 20, dataFreshnessMs: 1_000, isLiquid: true,
  hasAmbiguousResolution: false, resolutionAmbiguityScore: 0, category: 'politics', tags: [], scannedAt: new Date()
};

const portfolio: PortfolioState = { tenantId: 'tenant', cash: 10_000, equity: 10_000, totalExposure: 500, categoryExposure: { politics: 200 }, positions: [], openOrderCount: 1, dailyPnl: 0, maxDrawdown: 0, severeMismatchOpen: false };
const proposal: TradeProposal = { marketId: 'market', side: 'yes', edge: 0.1, adjustedEdge: 0.08, penalizedEdge: 0.07, opportunityScore: 0.5, suggestedSize: 100, limitPrice: 0.48, ensemble: { ensembleProbability: 0.58, ensembleUncertainty: 0.05, ensembleConfidence: 0.8, modelEstimates: [], outlierModels: [], calibrationAdjustment: 0, disagreementScore: 0.08, recommendTrade: true } };

function ctx(overrides: Partial<RiskContext> = {}): RiskContext {
  return { mode: 'paper', liveAuthorized: false, killSwitchActive: false, market, proposal, portfolio, mandateId: 'conservative', dailyLossLimit: 500, drawdownLimit: 0.1, maxOpenOrders: 10, maxParticipationRate: 0.1, severeAnomaly: false, now: new Date(), ...overrides };
}

describe('risk fortress', () => {
  it('exposes exactly the canonical 16 gates in order', () => {
    expect(RISK_GATE_ORDER).toEqual(['reconciliationGate','modeAuthorizationGate','killSwitchGate','dailyLossGate','drawdownBrakeGate','totalExposureGate','categoryExposureGate','singleMarketExposureGate','openOrderCountGate','minEdgeGate','minConfidenceGate','spreadGate','liquidityParticipationGate','deepAnomalyGate','orderSizeSanityGate','mandateSpecificGate']);
  });

  it.each([
    ['reconciliationGate', ctx({ portfolio: { ...portfolio, severeMismatchOpen: true } })],
    ['modeAuthorizationGate', ctx({ mode: 'live' })],
    ['killSwitchGate', ctx({ killSwitchActive: true })],
    ['dailyLossGate', ctx({ portfolio: { ...portfolio, dailyPnl: -500 } })],
    ['drawdownBrakeGate', ctx({ portfolio: { ...portfolio, maxDrawdown: 0.1 } })],
    ['totalExposureGate', ctx({ portfolio: { ...portfolio, totalExposure: 2_000 }, proposal: { ...proposal, suggestedSize: 1000 } })],
    ['categoryExposureGate', ctx({ portfolio: { ...portfolio, categoryExposure: { politics: 750 } }, proposal: { ...proposal, suggestedSize: 100 } })],
    ['singleMarketExposureGate', ctx({ proposal: { ...proposal, suggestedSize: 400 } })],
    ['openOrderCountGate', ctx({ portfolio: { ...portfolio, openOrderCount: 10 } })],
    ['minEdgeGate', ctx({ proposal: { ...proposal, penalizedEdge: 0.01 } })],
    ['minConfidenceGate', ctx({ proposal: { ...proposal, ensemble: { ...proposal.ensemble, ensembleConfidence: 0.1 } } })],
    ['spreadGate', ctx({ market: { ...market, spread: 0.031 } })],
    ['liquidityParticipationGate', ctx({ market: { ...market, totalLiquidity: 1_000 }, proposal: { ...proposal, suggestedSize: 200 } })],
    ['deepAnomalyGate', ctx({ severeAnomaly: true })],
    ['orderSizeSanityGate', ctx({ proposal: { ...proposal, suggestedSize: -1 } })],
    ['mandateSpecificGate', ctx({ market: { ...market, hasAmbiguousResolution: true } })]
  ])('blocks on %s', (gate, input) => {
    expect(evaluateRisk(input).blockedBy).toBe(gate);
  });
});
