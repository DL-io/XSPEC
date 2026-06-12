import type { MandateId, NormalizedMarket, OperatingMode, PortfolioState, RiskDecision, TradeProposal } from '@polyshore/core';

export interface MandateConfig {
  minEdge: number;
  minConfidence: number;
  fractionalKelly: number;
  maxSingleMarketExposure: number;
  maxCategoryExposure: number;
  maxTotalExposure: number;
  reserveFloor?: number;
  bankrollFloor?: number;
  dailyLossStop?: number;
  hardMaxTrade?: number;
  normalTradeSize?: number;
  marketDurationMinHours?: number;
  marketDurationMaxHours?: number;
  staleOrderCancelSeconds?: number;
  minLiquidity?: number;
}

export const MANDATES: Record<MandateId, MandateConfig> = {
  ultra_conservative: { minEdge: 0.08, minConfidence: 0.75, fractionalKelly: 0.15, maxSingleMarketExposure: 0.02, maxCategoryExposure: 0.06, maxTotalExposure: 0.15 },
  conservative: { minEdge: 0.06, minConfidence: 0.70, fractionalKelly: 0.25, maxSingleMarketExposure: 0.03, maxCategoryExposure: 0.08, maxTotalExposure: 0.20 },
  balanced: { minEdge: 0.05, minConfidence: 0.67, fractionalKelly: 0.35, maxSingleMarketExposure: 0.05, maxCategoryExposure: 0.12, maxTotalExposure: 0.28 },
  aggressive: { minEdge: 0.04, minConfidence: 0.65, fractionalKelly: 0.45, maxSingleMarketExposure: 0.07, maxCategoryExposure: 0.16, maxTotalExposure: 0.35 },
  micro: {
    minEdge: 0.06,
    minConfidence: 0.68,
    fractionalKelly: 0.10,
    maxSingleMarketExposure: 0.15,
    maxCategoryExposure: 0.30,
    maxTotalExposure: 0.40,
    reserveFloor: 10,
    bankrollFloor: 15,
    dailyLossStop: 3,
    hardMaxTrade: 3,
    normalTradeSize: 2,
    marketDurationMinHours: 6,
    marketDurationMaxHours: 48,
    staleOrderCancelSeconds: 15,
    minLiquidity: 200
  }
};

export const RISK_GATE_ORDER = [
  'reconciliationGate',
  'modeAuthorizationGate',
  'killSwitchGate',
  'bankrollFloorGate',
  'reserveFloorGate',
  'dailyLossGate',
  'drawdownBrakeGate',
  'totalExposureGate',
  'categoryExposureGate',
  'singleMarketExposureGate',
  'openOrderCountGate',
  'minEdgeGate',
  'minConfidenceGate',
  'spreadGate',
  'marketDurationGate',
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
  maxOrderSize?: number;
  maxModelDisagreement?: number;
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
  bankrollFloorGate: (ctx) => {
    const floor = MANDATES[ctx.mandateId].bankrollFloor;
    if (!floor) return { ok: true };
    return ctx.portfolio.cash < floor ? { ok: false, reason: `bankroll $${ctx.portfolio.cash.toFixed(2)} below floor $${floor}` } : { ok: true };
  },
  reserveFloorGate: (ctx) => {
    const floor = MANDATES[ctx.mandateId].reserveFloor;
    if (!floor) return { ok: true };
    const reserve = ctx.portfolio.cash - ctx.portfolio.totalExposure;
    return reserve < floor ? { ok: false, reason: `cash reserve $${reserve.toFixed(2)} below floor $${floor}` } : { ok: true };
  },
  dailyLossGate: (ctx) => {
    const limit = MANDATES[ctx.mandateId].dailyLossStop ?? ctx.dailyLossLimit;
    return Math.abs(Math.min(ctx.portfolio.dailyPnl, 0)) >= limit ? { ok: false, reason: 'daily loss limit breached', coolingMs: 4 * HOUR } : { ok: true };
  },
  drawdownBrakeGate: (ctx) => ctx.portfolio.maxDrawdown >= ctx.drawdownLimit ? { ok: false, reason: 'drawdown brake activated', coolingMs: 24 * HOUR } : { ok: true },
  totalExposureGate: (ctx) => ctx.portfolio.totalExposure + ctx.proposal.suggestedSize > ctx.portfolio.equity * MANDATES[ctx.mandateId].maxTotalExposure ? { ok: false, reason: 'total exposure limit exceeded' } : { ok: true },
  categoryExposureGate: (ctx) => (ctx.portfolio.categoryExposure[ctx.market.category] ?? 0) + ctx.proposal.suggestedSize > ctx.portfolio.equity * MANDATES[ctx.mandateId].maxCategoryExposure ? { ok: false, reason: 'category exposure limit exceeded' } : { ok: true },
  singleMarketExposureGate: (ctx) => ctx.proposal.suggestedSize > ctx.portfolio.equity * MANDATES[ctx.mandateId].maxSingleMarketExposure ? { ok: false, reason: 'single market exposure limit exceeded' } : { ok: true },
  openOrderCountGate: (ctx) => ctx.portfolio.openOrderCount >= ctx.maxOpenOrders ? { ok: false, reason: 'open order count limit exceeded' } : { ok: true },
  minEdgeGate: (ctx) => ctx.proposal.penalizedEdge < MANDATES[ctx.mandateId].minEdge ? { ok: false, reason: 'minimum edge not met' } : { ok: true },
  minConfidenceGate: (ctx) => ctx.proposal.ensemble.ensembleConfidence < MANDATES[ctx.mandateId].minConfidence ? { ok: false, reason: 'minimum confidence not met' } : { ok: true },
  spreadGate: (ctx) => ctx.market.dataFreshnessMs > 30_000 ? { ok: false, reason: 'market data is stale' } : ctx.market.spread > 0.03 ? { ok: false, reason: 'spread exceeds 3 percent' } : ctx.proposal.ensemble.disagreementScore > (ctx.maxModelDisagreement ?? 0.2) ? { ok: false, reason: 'model disagreement exceeds limit' } : { ok: true },
  marketDurationGate: (ctx) => {
    const minH = MANDATES[ctx.mandateId].marketDurationMinHours ?? 2;
    const maxH = MANDATES[ctx.mandateId].marketDurationMaxHours ?? 720;
    const hoursLeft = (ctx.market.resolutionDate.getTime() - ctx.now.getTime()) / 3_600_000;
    if (hoursLeft < minH) return { ok: false, reason: `market resolves in ${hoursLeft.toFixed(1)}h, below ${minH}h minimum` };
    if (hoursLeft > maxH) return { ok: false, reason: `market resolves in ${hoursLeft.toFixed(1)}h, above ${maxH}h maximum` };
    return { ok: true };
  },
  liquidityParticipationGate: (ctx) => ctx.market.totalLiquidity <= 0 || ctx.proposal.suggestedSize / ctx.market.totalLiquidity > ctx.maxParticipationRate ? { ok: false, reason: 'liquidity participation limit exceeded' } : { ok: true },
  deepAnomalyGate: (ctx) => ctx.severeAnomaly ? { ok: false, reason: 'deep anomaly detected' } : { ok: true },
  orderSizeSanityGate: (ctx) => {
    const hardMax = MANDATES[ctx.mandateId].hardMaxTrade ?? ctx.maxOrderSize ?? ctx.portfolio.cash;
    return !Number.isFinite(ctx.proposal.suggestedSize) || ctx.proposal.suggestedSize <= 0 || ctx.proposal.suggestedSize > ctx.portfolio.cash || ctx.proposal.suggestedSize > hardMax ? { ok: false, reason: 'order size sanity check failed' } : { ok: true };
  },
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
  return { approved: true, reasons: [], evaluatedGates, maxApprovedSize: Math.min(ctx.proposal.suggestedSize, ctx.maxOrderSize ?? ctx.proposal.suggestedSize, ctx.portfolio.cash) };
}
