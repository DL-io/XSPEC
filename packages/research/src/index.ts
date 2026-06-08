import type { MarketDossier, NormalizedMarket, StageFailure } from '@polyshore/core';
import { resolutionAmbiguityScore } from '@polyshore/scanner';
import { configuredResearchProviders, type LlmReasoningProvider, type WebResearchProvider } from './providers';
export * from './providers';

export type ResearchStage = (market: NormalizedMarket) => Promise<Partial<MarketDossier>>;
export interface ResearchProviderConfig {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  TAVILY_API_KEY?: string;
  RESEARCH_PROVIDERS_REQUIRED?: boolean;
  OLLAMA_BASE_URL?: string;
  OLLAMA_MODEL?: string;
}

export const REQUIRED_RESEARCH_STAGES = [
  'resolution_parser',
  'web_research',
  'base_rate_calculator',
  'sentiment_analyzer',
  'microstructure_analyzer',
  'catalyst_forecaster',
  'memory_matcher',
  'deep_reasoner'
] as const;

export function assertRequiredStages(stages: Record<string, ResearchStage>): void {
  const missing = REQUIRED_RESEARCH_STAGES.filter((stage) => !stages[stage]);
  if (missing.length) throw new Error(`Missing required research stages: ${missing.join(', ')}`);
}

export function defaultResearchStages(): Record<string, ResearchStage> {
  return degradedResearchStages('research providers unavailable');
}

export function degradedResearchStages(reason: string): Record<string, ResearchStage> {
  return {
    resolution_parser: async (market) => ({
      resolutionClarified: market.resolutionCriteria,
      resolutionAmbiguityScore: resolutionAmbiguityScore(market.resolutionCriteria),
      keyResolutionRisks: market.hasAmbiguousResolution ? ['scanner flagged ambiguous resolution'] : [],
      skipRecommended: true,
      skipReason: reason
    }),
    web_research: async () => unavailable('web_research', reason),
    base_rate_calculator: async () => unavailable('base_rate_calculator', reason),
    sentiment_analyzer: async () => unavailable('sentiment_analyzer', reason),
    microstructure_analyzer: async () => unavailable('microstructure_analyzer', reason),
    catalyst_forecaster: async () => unavailable('catalyst_forecaster', reason),
    memory_matcher: async () => unavailable('memory_matcher', reason),
    deep_reasoner: async () => unavailable('deep_reasoner', reason)
  };
}

export function createResearchStages(input: { webProvider?: WebResearchProvider; reasoningProvider?: LlmReasoningProvider }): Record<string, ResearchStage> {
  if (!input.webProvider || !input.reasoningProvider) return degradedResearchStages('research providers unavailable');
  let facts: MarketDossier['currentFacts'] = [];
  return {
    resolution_parser: async (market) => ({
      resolutionClarified: market.resolutionCriteria,
      resolutionAmbiguityScore: resolutionAmbiguityScore(market.resolutionCriteria),
      keyResolutionRisks: market.hasAmbiguousResolution ? ['scanner flagged ambiguous resolution'] : []
    }),
    web_research: async (market) => {
      const result = await input.webProvider?.research(market);
      facts = result?.facts ?? [];
      return {
        currentFacts: facts,
        contradictions: result?.contradictions ?? [],
        sourceCount: result?.sourceCount ?? facts.length,
        sourceQuality: result?.sourceQuality ?? 0,
        informationAge: result?.informationAge ?? market.dataFreshnessMs
      };
    },
    base_rate_calculator: async (market) => ({ baseRate: market.midpoint }),
    sentiment_analyzer: async () => ({ sentimentSignal: 0 }),
    microstructure_analyzer: async (market) => ({ microstructureSignal: market.bidDepth1Pct - market.askDepth1Pct }),
    catalyst_forecaster: async (market) => ({
      catalysts: market.tags,
      keyDrivers: [market.category, ...facts.slice(0, 3).map((fact) => fact.claim)].filter(Boolean)
    }),
    memory_matcher: async () => ({ marketMemoryMatches: [] }),
    deep_reasoner: async (market) => {
      const reasoning = await input.reasoningProvider?.reason(market, facts);
      return reasoning ?? {};
    }
  };
}

export function createResearchStagesFromConfig(config: ResearchProviderConfig): Record<string, ResearchStage> {
  return createResearchStages(configuredResearchProviders(config));
}

export async function buildDossier(market: NormalizedMarket, stages: Record<string, ResearchStage>, timeoutMs = 45_000): Promise<MarketDossier> {
  assertRequiredStages(stages);
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
    skipRecommended: partial.skipRecommended ?? (hasCriticalResearchFailure(stageFailures) || stageFailures.length > 3 || ambiguity >= 0.4),
    skipReason: partial.skipReason ?? (hasCriticalResearchFailure(stageFailures) ? 'critical research provider unavailable' : stageFailures.length > 3 ? 'excessive research stage failures' : ambiguity >= 0.4 ? 'resolution ambiguity threshold exceeded' : undefined)
  };
}

function unavailable(stage: string, reason: string): never {
  throw new Error(`${stage} unavailable: ${reason}`);
}

function hasCriticalResearchFailure(failures: StageFailure[]): boolean {
  return failures.some((failure) => failure.stage === 'web_research' || failure.stage === 'deep_reasoner');
}
