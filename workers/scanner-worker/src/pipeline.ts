import type { DecisionAudit, MandateId, NormalizedMarket, OperatingMode, OrderbookSnapshot, PortfolioState } from '@polyshore/core';
import { assertCompleteDecisionAudit } from '@polyshore/audit';
import { DossierRepository, type OmegaDb, DecisionAuditRepository, MarketFeatureRepository, MarketMemoryRepository, OrderbookRepository, ProbabilityEstimateRepository, RiskEventRepository } from '@polyshore/db';
import { computeFeatureSnapshot } from '@polyshore/features';
import { buildEnsemble, computeCalibrationAdjustment, computeModelWeights, generateModelEstimates, type CalibrationDataPoint, type ModelPerformanceRecord } from '@polyshore/models';
import { proposeTrade } from '@polyshore/portfolio';
import { buildDossier, defaultResearchStages, type ResearchStage } from '@polyshore/research';
import { evaluateRisk } from '@polyshore/risk';

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
  modelPerformanceRecords?: ModelPerformanceRecord[];
  calibrationData?: CalibrationDataPoint[];
  now?: Date;
}

export async function evaluateMarketPipeline(db: OmegaDb, market: NormalizedMarket, config: PipelineConfig): Promise<DecisionAudit> {
  const now = config.now ?? new Date();
  const featureSnapshot = computeFeatureSnapshot(market, '1m');
  if (config.capturedOrderbook) await new OrderbookRepository(db).put(config.capturedOrderbook);
  await new MarketFeatureRepository(db).put(featureSnapshot);
  const marketWithFeatures = { ...market, featureSnapshot };

  // Fetch memory matches for this market so historical_analog has real data
  const memoryMatches = await new MarketMemoryRepository(db).searchByTextSimilarity(
    `${market.question} ${market.resolutionCriteria}`, 5
  );
  const stagesWithMemory = config.researchStages
    ? config.researchStages
    : defaultResearchStages();

  const dossier = await buildDossier(marketWithFeatures, stagesWithMemory, 45_000, memoryMatches);
  const dossierId = await new DossierRepository(db).put(dossier);

  // Apply Bayesian confidence weights if historical performance data is available
  const weightOverrides = config.modelPerformanceRecords?.length
    ? computeModelWeights(config.modelPerformanceRecords)
    : undefined;

  const modelEstimates = generateModelEstimates({ market: marketWithFeatures, dossier, featureSnapshot, weightOverrides });
  await new ProbabilityEstimateRepository(db).putMany({ tenantId: config.tenantId, marketId: market.id, estimates: modelEstimates, createdAt: now });

  // Apply Platt-scaling calibration adjustment if sufficient historical data is available
  const rawEnsemble = buildEnsemble(modelEstimates);
  const calibrationAdjustment = config.calibrationData?.length
    ? computeCalibrationAdjustment(rawEnsemble.ensembleProbability, config.calibrationData)
    : 0;
  const ensembleOutput = calibrationAdjustment !== 0 ? buildEnsemble(modelEstimates, calibrationAdjustment) : rawEnsemble;
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
