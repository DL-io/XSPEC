import type { FeatureSnapshot, MarketDossier, ModelEstimate, NormalizedMarket, EnsembleResult } from '@polyshore/core';

export const LAUNCH_MODELS = ['base_rate', 'llm_research', 'sentiment', 'microstructure', 'historical_analog', 'deep_reasoner', 'relative_value', 'basket_tilt', 'quant_model'] as const;

export function generateModelEstimates(input: { market: NormalizedMarket; dossier: MarketDossier; featureSnapshot: FeatureSnapshot }): ModelEstimate[] {
  const { market, dossier, featureSnapshot } = input;
  return [
    estimate('base_rate', dossier.baseRate || market.midpoint, 0.75, ['dossier base rate'], dossier),
    estimate('llm_research', dossier.probabilityEstimate, dossier.confidence, ['research dossier probability'], dossier),
    estimate('sentiment', market.midpoint + dossier.sentimentSignal * 0.05, 0.7, ['sentiment signal'], dossier),
    estimate('microstructure', market.midpoint + featureSnapshot.orderFlowImbalance * 0.04 - market.spread * 0.25, 0.75, ['order flow and spread'], dossier),
    estimate('historical_analog', dossier.marketMemoryMatches[0]?.outcome ?? (dossier.baseRate || market.midpoint), 0.7, ['market memory'], dossier),
    estimate('deep_reasoner', (dossier.probabilityLow + dossier.probabilityHigh + dossier.probabilityEstimate) / 3, dossier.evidenceStrength, ['reasoned probability band'], dossier),
    estimate('relative_value', market.midpoint + featureSnapshot.crossMarketCorrelationScore * 0.03, 0.7, ['cross-market feature'], dossier),
    estimate('basket_tilt', market.midpoint + featureSnapshot.momentum * 0.2, 0.7, ['price momentum'], dossier),
    estimate('quant_model', market.midpoint + featureSnapshot.volumeBurstScore * 0.005 - featureSnapshot.volatility * 0.02, 0.7, ['feature snapshot'], dossier)
  ];
}

function estimate(modelId: string, probability: number, confidenceWeight: number, evidence: string[], dossier: MarketDossier): ModelEstimate {
  return {
    modelId,
    probability: clamp(probability, 0.01, 0.99),
    confidenceWeight: clamp(confidenceWeight, 0, 1),
    evidence,
    freshnessScore: Date.now() <= dossier.freshnessExpiresAt.getTime() ? 1 : 0.35
  };
}

export function buildEnsemble(estimates: ModelEstimate[], calibrationAdjustment = 0): EnsembleResult {
  const successful = estimates.filter((estimate) => !estimate.failureReason && Number.isFinite(estimate.probability));
  if (successful.length < 3) {
    return { ensembleProbability: 0, ensembleUncertainty: 1, ensembleConfidence: 0, modelEstimates: estimates, outlierModels: [], calibrationAdjustment, disagreementScore: 1, recommendTrade: false, skipReason: 'fewer than 3 models succeeded' };
  }
  const sorted = [...successful].sort((a, b) => a.probability - b.probability);
  const median = sorted[Math.floor(sorted.length / 2)].probability;
  const outlierModels = successful.filter((e) => Math.abs(e.probability - median) > 0.20).map((e) => e.modelId);
  const weighted = successful.map((estimate) => {
    const outlierPenalty = outlierModels.includes(estimate.modelId) ? 0.25 : 1;
    const weight = estimate.confidenceWeight * estimate.freshnessScore * outlierPenalty;
    return { estimate, weight };
  });
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const rawProbability = weighted.reduce((sum, item) => sum + item.estimate.probability * item.weight, 0) / totalWeight;
  const ensembleProbability = clamp(rawProbability + calibrationAdjustment, 0.01, 0.99);
  const variance = weighted.reduce((sum, item) => sum + item.weight * (item.estimate.probability - ensembleProbability) ** 2, 0) / totalWeight;
  const ensembleUncertainty = Math.sqrt(variance);
  const ensembleConfidence = clamp(successful.reduce((sum, item) => sum + item.confidenceWeight, 0) / successful.length, 0, 1);
  const disagreementScore = ensembleProbability === 0 ? 1 : ensembleUncertainty / ensembleProbability;
  return {
    ensembleProbability,
    ensembleUncertainty,
    ensembleConfidence,
    modelEstimates: estimates,
    outlierModels,
    calibrationAdjustment,
    disagreementScore,
    recommendTrade: disagreementScore <= 0.15,
    skipReason: disagreementScore > 0.15 ? 'coefficient of variation exceeds 0.15' : undefined
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
