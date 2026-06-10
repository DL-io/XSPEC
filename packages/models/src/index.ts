import type { FeatureSnapshot, MarketDossier, ModelEstimate, NormalizedMarket, EnsembleResult } from '@polyshore/core';
import { z } from 'zod';

export const LAUNCH_MODELS = ['base_rate', 'llm_research', 'sentiment', 'microstructure', 'historical_analog', 'deep_reasoner', 'relative_value', 'basket_tilt', 'quant_model'] as const;

export const ModelEstimateSchema = z.object({
  modelId: z.string().min(1),
  probability: z.number().min(0).max(1),
  confidenceWeight: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  freshnessScore: z.number().min(0).max(1),
  failureReason: z.string().optional()
});

// Historical prediction/outcome pair used to compute per-model performance
export interface ModelPerformanceRecord {
  modelId: string;
  probability: number;
  outcome: 0 | 1;
}

// Resolved prediction pair used for ensemble calibration
export interface CalibrationDataPoint {
  predictedProbability: number;
  outcome: 0 | 1;
}

// Compute per-model confidence weights from historical Brier scores.
// Models with lower Brier scores (better calibration) receive higher weights.
// Returns a map of modelId → confidenceWeight in [0.3, 1.0].
export function computeModelWeights(records: ModelPerformanceRecord[]): Record<string, number> {
  const byModel: Record<string, number[]> = {};
  for (const r of records) {
    if (!byModel[r.modelId]) byModel[r.modelId] = [];
    byModel[r.modelId].push((r.probability - r.outcome) ** 2);
  }
  const result: Record<string, number> = {};
  for (const modelId of LAUNCH_MODELS) {
    const scores = byModel[modelId];
    if (!scores || scores.length < 3) {
      // Insufficient history: use default (0.25 Brier ≈ random baseline → weight 0.75)
      result[modelId] = 0.75;
    } else {
      const brierScore = scores.reduce((s, v) => s + v, 0) / scores.length;
      // Transform: weight = 1 - brier, clamped to [0.3, 1.0]
      result[modelId] = clamp(1 - brierScore, 0.3, 1.0);
    }
  }
  return result;
}

// Platt scaling calibration adjustment.
// Fits a logistic regression: P_cal = sigmoid(a * logit(P_raw) + b)
// Returns the signed adjustment to add to rawProbability after ensemble.
// Falls back to 0 if insufficient data (< 10 records) or degenerate inputs.
export function computeCalibrationAdjustment(rawProbability: number, records: CalibrationDataPoint[]): number {
  if (records.length < 10) return 0;
  const filtered = records.filter((r) => r.predictedProbability > 0.001 && r.predictedProbability < 0.999);
  if (filtered.length < 10) return 0;

  // Gradient descent to fit a (slope) and b (bias) for logistic calibration
  let a = 1.0;
  let b = 0.0;
  const lr = 0.05;
  for (let iter = 0; iter < 200; iter++) {
    let dA = 0;
    let dB = 0;
    for (const { predictedProbability: p, outcome: y } of filtered) {
      const logitP = Math.log(p / (1 - p));
      const pCal = sigmoid(a * logitP + b);
      const err = pCal - y;
      dA += err * logitP;
      dB += err;
    }
    a -= (lr / filtered.length) * dA;
    b -= (lr / filtered.length) * dB;
  }

  const logitRaw = rawProbability > 0.001 && rawProbability < 0.999
    ? Math.log(rawProbability / (1 - rawProbability))
    : 0;
  const calibrated = sigmoid(a * logitRaw + b);
  return clamp(calibrated - rawProbability, -0.15, 0.15);
}

export function generateModelEstimates(input: {
  market: NormalizedMarket;
  dossier: MarketDossier;
  featureSnapshot: FeatureSnapshot;
  weightOverrides?: Record<string, number>;
}): ModelEstimate[] {
  const { market, dossier, featureSnapshot, weightOverrides } = input;
  const w = (modelId: string, staticDefault: number) => weightOverrides?.[modelId] ?? staticDefault;

  return [
    estimate('base_rate', dossier.baseRate || market.midpoint, w('base_rate', 0.75), ['dossier base rate'], dossier),
    estimate('llm_research', dossier.probabilityEstimate, w('llm_research', dossier.confidence), ['research dossier probability'], dossier),
    estimate('sentiment', market.midpoint + dossier.sentimentSignal * 0.05, w('sentiment', 0.7), ['sentiment signal'], dossier),
    estimate('microstructure', market.midpoint + featureSnapshot.orderFlowImbalance * 0.04 - market.spread * 0.25, w('microstructure', 0.75), ['order flow and spread'], dossier),
    estimate('historical_analog', dossier.marketMemoryMatches[0]?.outcome ?? (dossier.baseRate || market.midpoint), w('historical_analog', 0.7), ['market memory'], dossier),
    estimate('deep_reasoner', (dossier.probabilityLow + dossier.probabilityHigh + dossier.probabilityEstimate) / 3, w('deep_reasoner', dossier.evidenceStrength), ['reasoned probability band'], dossier),
    estimate('relative_value', market.midpoint + featureSnapshot.crossMarketCorrelationScore * 0.03, w('relative_value', 0.7), ['cross-market feature'], dossier),
    estimate('basket_tilt', market.midpoint + featureSnapshot.momentum * 0.2, w('basket_tilt', 0.7), ['price momentum'], dossier),
    estimate('quant_model', market.midpoint + featureSnapshot.volumeBurstScore * 0.005 - featureSnapshot.volatility * 0.02, w('quant_model', 0.7), ['feature snapshot'], dossier)
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
  const parsed = z.array(ModelEstimateSchema).safeParse(estimates);
  if (!parsed.success) {
    return { ensembleProbability: 0, ensembleUncertainty: 1, ensembleConfidence: 0, modelEstimates: estimates, outlierModels: [], calibrationAdjustment, disagreementScore: 1, recommendTrade: false, skipReason: `malformed model output: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}` };
  }
  const successful = parsed.data.filter((estimate) => !estimate.failureReason && Number.isFinite(estimate.probability));
  if (successful.length < 3) {
    return { ensembleProbability: 0, ensembleUncertainty: 1, ensembleConfidence: 0, modelEstimates: parsed.data, outlierModels: [], calibrationAdjustment, disagreementScore: 1, recommendTrade: false, skipReason: 'fewer than 3 models succeeded' };
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
    modelEstimates: parsed.data,
    outlierModels,
    calibrationAdjustment,
    disagreementScore,
    recommendTrade: disagreementScore <= 0.15,
    skipReason: disagreementScore > 0.15 ? 'coefficient of variation exceeds 0.15' : undefined
  };
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
