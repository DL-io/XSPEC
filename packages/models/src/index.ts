import type { EnsembleResult, ModelEstimate } from '@polyshore/core';

export const LAUNCH_MODELS = ['base_rate', 'llm_research', 'sentiment', 'microstructure', 'historical_analog', 'deep_reasoner', 'relative_value', 'basket_tilt', 'quant_model'] as const;

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
