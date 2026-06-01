import type { MarketDossier, NormalizedMarket, StageFailure } from '@polyshore/core';
import { resolutionAmbiguityScore } from '@polyshore/scanner';

export type ResearchStage = (market: NormalizedMarket) => Promise<Partial<MarketDossier>>;

export async function buildDossier(market: NormalizedMarket, stages: Record<string, ResearchStage>, timeoutMs = 45_000): Promise<MarketDossier> {
  const started = Date.now();
  const partial: Partial<MarketDossier> = {};
  const stagesCompleted: string[] = [];
  const stageFailures: StageFailure[] = [];
  for (const [name, stage] of Object.entries(stages)) {
    if (Date.now() - started > timeoutMs) {
      stageFailures.push({ stage: name, reason: 'dossier generation timeout', retryable: true });
      break;
    }
    try {
      Object.assign(partial, await stage(market));
      stagesCompleted.push(name);
    } catch (error) {
      stageFailures.push({ stage: name, reason: error instanceof Error ? error.message : 'unknown failure', retryable: true });
    }
  }
  const ambiguity = partial.resolutionAmbiguityScore ?? resolutionAmbiguityScore(market.resolutionCriteria);
  return {
    marketId: market.id,
    generatedAt: new Date(),
    freshnessExpiresAt: new Date(Date.now() + 15 * 60_000),
    resolutionCriteria: market.resolutionCriteria,
    resolutionClarified: partial.resolutionClarified ?? market.resolutionCriteria,
    resolutionAmbiguityScore: ambiguity,
    keyResolutionRisks: partial.keyResolutionRisks ?? [],
    currentFacts: partial.currentFacts ?? [],
    contradictions: partial.contradictions ?? [],
    informationAge: partial.informationAge ?? 0,
    sourceCount: partial.sourceCount ?? 0,
    sourceQuality: partial.sourceQuality ?? 0,
    baseRate: partial.baseRate ?? 0,
    keyDrivers: partial.keyDrivers ?? [],
    catalysts: partial.catalysts ?? [],
    sentimentSignal: partial.sentimentSignal ?? 0,
    microstructureSignal: partial.microstructureSignal ?? 0,
    probabilityEstimate: partial.probabilityEstimate ?? market.midpoint,
    probabilityLow: partial.probabilityLow ?? Math.max(0, market.midpoint - 0.1),
    probabilityHigh: partial.probabilityHigh ?? Math.min(1, market.midpoint + 0.1),
    confidence: partial.confidence ?? 0,
    evidenceStrength: partial.evidenceStrength ?? 0,
    contraryCase: partial.contraryCase ?? '',
    steelmanRebuttal: partial.steelmanRebuttal ?? '',
    identifiedBlindSpots: partial.identifiedBlindSpots ?? [],
    marketMemoryMatches: partial.marketMemoryMatches ?? [],
    stagesCompleted,
    stageFailures,
    skipRecommended: stageFailures.length > 3 || ambiguity >= 0.4,
    skipReason: stageFailures.length > 3 ? 'excessive research stage failures' : ambiguity >= 0.4 ? 'resolution ambiguity threshold exceeded' : undefined
  };
}
