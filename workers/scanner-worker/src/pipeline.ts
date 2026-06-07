import type { DecisionAudit, MandateId, NormalizedMarket, OperatingMode, OrderbookSnapshot, PortfolioState } from '@polyshore/core';
import { assertCompleteDecisionAudit } from '../../../packages/audit/src/index.ts';
import { DossierRepository, type OmegaDb, DecisionAuditRepository, MarketFeatureRepository, OrderbookRepository, ProbabilityEstimateRepository, RiskEventRepository } from '../../../packages/db/src/index.ts';
import { computeFeatureSnapshot } from '../../../packages/features/src/index.ts';
import { buildEnsemble, generateModelEstimates } from '../../../packages/models/src/index.ts';
import { proposeTrade } from '../../../packages/portfolio/src/index.ts';
import { buildDossier, defaultResearchStages, type ResearchStage } from '../../../packages/research/src/index.ts';
import { evaluateRisk } from '../../../packages/risk/src/index.ts';

export interface PipelineConfig {
  tenantId: string;
  mode: OperatingMode;
  mandateId: MandateId;
  portfolio: PortfolioState;
  liveAuthorized: boolean;
  killSwitchActive: boolean;
  dailyLossLimit: number;
  drawdownLimit: number;
  maxOpenOrders: number;
  maxParticipationRate: number;
  severeAnomaly: boolean;
  liveActivationConfirmedAt?: Date;
  capturedOrderbook?: OrderbookSnapshot;
  researchStages?: Record<string, ResearchStage>;
  now?: Date;
}

export async function evaluateMarketPipeline(db: OmegaDb, market: NormalizedMarket, config: PipelineConfig): Promise<DecisionAudit> {
  const now = config.now ?? new Date();
  const featureSnapshot = computeFeatureSnapshot(market, '1m');
  if (config.capturedOrderbook) await new OrderbookRepository(db).put(config.capturedOrderbook);
  await new MarketFeatureRepository(db).put(featureSnapshot);
  const marketWithFeatures = { ...market, featureSnapshot };
  const dossier = await buildDossier(marketWithFeatures, config.researchStages ?? defaultResearchStages());
  const dossierId = await new DossierRepository(db).put(dossier);
  const modelEstimates = generateModelEstimates({ market: marketWithFeatures, dossier, featureSnapshot });
  await new ProbabilityEstimateRepository(db).putMany({ tenantId: config.tenantId, marketId: market.id, estimates: modelEstimates, createdAt: now });
  const ensembleOutput = buildEnsemble(modelEstimates);
  const tradeProposal = proposeTrade(marketWithFeatures, ensembleOutput, config.portfolio, config.mandateId);
  const riskDecision = evaluateRisk({
    mode: config.mode,
    liveAuthorized: config.liveAuthorized,
    killSwitchActive: config.killSwitchActive,
    market: marketWithFeatures,
    proposal: tradeProposal,
    portfolio: config.portfolio,
    mandateId: config.mandateId,
    dailyLossLimit: config.dailyLossLimit,
    drawdownLimit: config.drawdownLimit,
    maxOpenOrders: config.maxOpenOrders,
    maxParticipationRate: config.maxParticipationRate,
    severeAnomaly: config.severeAnomaly,
    liveActivationConfirmedAt: config.liveActivationConfirmedAt,
    now
  });
  const finalOutcome = !dossier.skipRecommended && ensembleOutput.recommendTrade && riskDecision.approved ? 'trade' : 'skip';
  await new RiskEventRepository(db).appendFromDecision({ tenantId: config.tenantId, marketId: market.id, decision: riskDecision, createdAt: now });
  const audit: DecisionAudit = {
    id: crypto.randomUUID(),
    marketId: market.id,
    tenantId: config.tenantId,
    scannerData: marketWithFeatures,
    capturedOrderbook: config.capturedOrderbook,
    featureSnapshot,
    dossierId,
    dossierSummary: {
      marketId: dossier.marketId,
      generatedAt: dossier.generatedAt,
      freshnessExpiresAt: dossier.freshnessExpiresAt,
      probabilityEstimate: dossier.probabilityEstimate,
      confidence: dossier.confidence,
      skipRecommended: dossier.skipRecommended,
      skipReason: dossier.skipReason
    },
    modelEstimates,
    ensembleOutput,
    tradeProposal,
    edgeCalculations: {
      edge: tradeProposal.edge,
      adjustedEdge: tradeProposal.adjustedEdge,
      penalizedEdge: tradeProposal.penalizedEdge
    },
    riskDecision,
    opportunityScore: tradeProposal.opportunityScore,
    finalOutcome,
    createdAt: now
  };
  assertCompleteDecisionAudit(audit);
  await new DecisionAuditRepository(db).append(audit);
  return audit;
}
