import type { MandateId, NormalizedMarket, OperatingMode, PortfolioState, RiskDecision, TradeProposal } from '@polyshore/core';

export const MANDATES = {
  ultra_conservative: { minEdge: 0.08, minConfidence: 0.75, fractionalKelly: 0.15, maxSingleMarketExposure: 0.02, maxCategoryExposure: 0.06, maxTotalExposure: 0.15 },
  conservative: { minEdge: 0.06, minConfidence: 0.70, fractionalKelly: 0.25, maxSingleMarketExposure: 0.03, maxCategoryExposure: 0.08, maxTotalExposure: 0.20 },
  balanced: { minEdge: 0.05, minConfidence: 0.67, fractionalKelly: 0.35, maxSingleMarketExposure: 0.05, maxCategoryExposure: 0.12, maxTotalExposure: 0.28 },
  aggressive: { minEdge: 0.04, minConfidence: 0.65, fractionalKelly: 0.45, maxSingleMarketExposure: 0.07, maxCategoryExposure: 0.16, maxTotalExposure: 0.35 }
} as const;

export const RISK_GATE_ORDER = [
  'reconciliationGate',
  'modeAuthorizationGate',
  'killSwitchGate',
  'dailyLossGate',
  'drawdownBrakeGate',
  'totalExposureGate',
  'categoryExposureGate',
  'singleMarketExposureGate',
  'openOrderCountGate',
  'minEdgeGate',
  'minConfidenceGate',
  'spreadGate',
  'liquidityParticipationGate',
  'deepAnomalyGate',
  'orderSizeSanityGate',
  'mandateSpecificGate'
] as const;

export type RiskGateName = (typeof RISK_GATE_ORDER)[number];

export interface RiskContext {
  mode: OperatingMode;
  liveAuthorized: boolean;
  killSwitchActive: boolean;
  market: NormalizedMarket;
  proposal: TradeProposal;
  portfolio: PortfolioState;
  mandateId: MandateId;
  dailyLossLimit: number;
  drawdownLimit: number;
  maxOpenOrders: number;
  maxParticipationRate: number;
  severeAnomaly: boolean;
  liveActivationConfirmedAt?: Date;
  now: Date;
}

interface GateResult { ok: boolean; reason?: string; coolingMs?: number; maxSize?: number; }
type Gate = (ctx: RiskContext) => GateResult;

const HOUR = 60 * 60 * 1000;

const gates: Record<RiskGateName, Gate> = {
  reconciliationGate: (ctx) => ctx.portfolio.severeMismatchOpen ? { ok: false, reason: 'severe reconciliation mismatch requires manual acknowledgment' } : { ok: true },
  modeAuthorizationGate: (ctx) => ctx.mode === 'live' && (!ctx.liveAuthorized || !ctx.liveActivationConfirmedAt) ? { ok: false, reason: 'live mode requires explicit operator confirmation' } : { ok: true },
  killSwitchGate: (ctx) => ctx.killSwitchActive ? { ok: false, reason: 'kill switch active' } : { ok: true },
  dailyLossGate: (ctx) => Math.abs(Math.min(ctx.portfolio.dailyPnl, 0)) >= ctx.dailyLossLimit ? { ok: false, reason: 'daily loss limit breached', coolingMs: 4 * HOUR } : { ok: true },
  drawdownBrakeGate: (ctx) => ctx.portfolio.maxDrawdown >= ctx.drawdownLimit ? { ok: false, reason: 'drawdown brake activated', coolingMs: 24 * HOUR } : { ok: true },
  totalExposureGate: (ctx) => ctx.portfolio.totalExposure + ctx.proposal.suggestedSize > ctx.portfolio.equity * MANDATES[ctx.mandateId].maxTotalExposure ? { ok: false, reason: 'total exposure limit exceeded' } : { ok: true },
  categoryExposureGate: (ctx) => (ctx.portfolio.categoryExposure[ctx.market.category] ?? 0) + ctx.proposal.suggestedSize > ctx.portfolio.equity * MANDATES[ctx.mandateId].maxCategoryExposure ? { ok: false, reason: 'category exposure limit exceeded' } : { ok: true },
  singleMarketExposureGate: (ctx) => ctx.proposal.suggestedSize > ctx.portfolio.equity * MANDATES[ctx.mandateId].maxSingleMarketExposure ? { ok: false, reason: 'single market exposure limit exceeded' } : { ok: true },
  openOrderCountGate: (ctx) => ctx.portfolio.openOrderCount >= ctx.maxOpenOrders ? { ok: false, reason: 'open order count limit exceeded' } : { ok: true },
  minEdgeGate: (ctx) => ctx.proposal.penalizedEdge < MANDATES[ctx.mandateId].minEdge ? { ok: false, reason: 'minimum edge not met' } : { ok: true },
  minConfidenceGate: (ctx) => ctx.proposal.ensemble.ensembleConfidence < MANDATES[ctx.mandateId].minConfidence ? { ok: false, reason: 'minimum confidence not met' } : { ok: true },
  spreadGate: (ctx) => ctx.market.spread > 0.03 ? { ok: false, reason: 'spread exceeds 3 percent' } : { ok: true },
  liquidityParticipationGate: (ctx) => ctx.market.totalLiquidity <= 0 || ctx.proposal.suggestedSize / ctx.market.totalLiquidity > ctx.maxParticipationRate ? { ok: false, reason: 'liquidity participation limit exceeded' } : { ok: true },
  deepAnomalyGate: (ctx) => ctx.severeAnomaly ? { ok: false, reason: 'deep anomaly detected' } : { ok: true },
  orderSizeSanityGate: (ctx) => !Number.isFinite(ctx.proposal.suggestedSize) || ctx.proposal.suggestedSize <= 0 || ctx.proposal.suggestedSize > ctx.portfolio.cash ? { ok: false, reason: 'order size sanity check failed' } : { ok: true },
  mandateSpecificGate: (ctx) => ctx.market.hasAmbiguousResolution && ctx.mandateId !== 'aggressive' ? { ok: false, reason: 'mandate blocks ambiguous resolution markets' } : { ok: true }
};

export function evaluateRisk(ctx: RiskContext): RiskDecision {
  const evaluatedGates: string[] = [];
  for (const gateName of RISK_GATE_ORDER) {
    evaluatedGates.push(gateName);
    const result = gates[gateName](ctx);
    if (!result.ok) {
      return {
        approved: false,
        blockedBy: gateName,
        reasons: [result.reason ?? gateName],
        coolingPeriodUntil: result.coolingMs ? new Date(ctx.now.getTime() + result.coolingMs) : undefined,
        evaluatedGates,
        maxApprovedSize: 0
      };
    }
  }
  return { approved: true, reasons: [], evaluatedGates, maxApprovedSize: ctx.proposal.suggestedSize };
}
