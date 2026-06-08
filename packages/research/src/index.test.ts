import { describe, expect, it, vi } from 'vitest';
import type { MarketDossier, NormalizedMarket } from '@polyshore/core';
import { buildDossier, createResearchStages, defaultResearchStages } from './index';
import { checkResearchProviderHealth, configuredResearchProviders, OllamaReasoningProvider, requestJsonWithRetry, type LlmReasoningProvider, type WebResearchProvider } from './providers';

describe('research provider stages', () => {
  it('does not emit fabricated research when providers are missing', async () => {
    const dossier = await buildDossier(marketFixture(), defaultResearchStages());

    expect(dossier.skipRecommended).toBe(true);
    expect(dossier.skipReason).toBe('research providers unavailable');
    expect(dossier.currentFacts).toEqual([]);
    expect(dossier.confidence).toBe(0);
    expect(dossier.evidenceStrength).toBe(0);
    expect(dossier.stageFailures.map((failure) => failure.stage)).toContain('web_research');
    expect(dossier.stageFailures.map((failure) => failure.stage)).toContain('deep_reasoner');
  });

  it('calls configured web and reasoning providers when both are available', async () => {
    const webProvider: WebResearchProvider = {
      id: 'test-web',
      research: vi.fn(async () => ({
        facts: [{ claim: 'source-backed fact', source: 'https://source.test/fact', capturedAt: new Date() }],
        contradictions: [],
        sourceCount: 1,
        sourceQuality: 0.9,
        informationAge: 0
      }))
    };
    const reasoningProvider: LlmReasoningProvider = {
      id: 'test-llm',
      reason: vi.fn(async (_market, facts) => ({
        probabilityEstimate: 0.62,
        probabilityLow: 0.55,
        probabilityHigh: 0.68,
        confidence: 0.81,
        evidenceStrength: 0.78,
        contraryCase: `Contrary case from ${facts.length} facts`,
        steelmanRebuttal: 'Evidence supports the estimate despite uncertainty.',
        identifiedBlindSpots: ['late-breaking information']
      }))
    };

    const dossier = await buildDossier(marketFixture(), createResearchStages({ webProvider, reasoningProvider }));

    expect(webProvider.research).toHaveBeenCalledOnce();
    expect(reasoningProvider.reason).toHaveBeenCalledOnce();
    expect(dossier.skipRecommended).toBe(false);
    expect(dossier.currentFacts).toHaveLength(1);
    expect(dossier.probabilityEstimate).toBe(0.62);
    expect(dossier.confidence).toBe(0.81);
  });

  it('reports degraded or failed provider health according to required mode', async () => {
    const optional = await checkResearchProviderHealth({}, false);
    const required = await checkResearchProviderHealth({ RESEARCH_PROVIDERS_REQUIRED: true }, false);
    const configured = await checkResearchProviderHealth({ OPENAI_API_KEY: 'key', TAVILY_API_KEY: 'key' }, false);

    expect(optional.map((item) => item.status)).toEqual(['DEGRADED', 'DEGRADED']);
    expect(required.map((item) => item.status)).toEqual(['FAILED', 'FAILED']);
    expect(configured.map((item) => item.status)).toEqual(['HEALTHY', 'HEALTHY']);
  });

  it('prefers Ollama as the configured reasoning provider', () => {
    const providers = configuredResearchProviders({
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
      OLLAMA_MODEL: 'gpt-oss:120b',
      OPENAI_API_KEY: 'openai-key'
    });

    expect(providers.reasoningProvider?.id).toBe('ollama');
  });

  it('validates Ollama reasoning JSON before returning dossier fields', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      message: {
        content: JSON.stringify({
          probabilityEstimate: 0.61,
          probabilityLow: 0.54,
          probabilityHigh: 0.7,
          confidence: 0.76,
          evidenceStrength: 0.72,
          contraryCase: 'The market may already include the major public facts.',
          steelmanRebuttal: 'Orderbook pricing still appears too low given source-backed catalysts.',
          identifiedBlindSpots: ['late liquidity shift']
        })
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await new OllamaReasoningProvider('http://127.0.0.1:11434', 'gpt-oss:120b').reason(marketFixture(), []);

    expect(result).toMatchObject({ probabilityEstimate: 0.61, confidence: 0.76 });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:11434/api/chat', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"model":"gpt-oss:120b"')
    }));
    fetchMock.mockRestore();
  });

  it('retries retryable provider failures', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 500, statusText: 'Server Error' }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await requestJsonWithRetry('https://provider.test', { timeoutMs: 25, backoffMs: 0, retries: 1 });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });
});

function marketFixture(): NormalizedMarket {
  return {
    id: 'market-1',
    source: 'kalshi',
    externalId: 'MKT',
    slug: 'mkt',
    question: 'Will the test event happen?',
    resolutionCriteria: 'Resolves yes if the test event happens before the deadline.',
    resolutionDate: new Date(Date.now() + 86_400_000),
    status: 'active',
    bestBid: 0.48,
    bestAsk: 0.52,
    spread: 0.04,
    spreadBps: 800,
    midpoint: 0.5,
    lastTradePrice: 0.5,
    bidDepth1Pct: 100,
    askDepth1Pct: 90,
    bidDepth5Pct: 500,
    askDepth5Pct: 450,
    totalLiquidity: 10_000,
    volume24h: 2_000,
    volume7d: 10_000,
    openInterest: 5_000,
    tradeCount24h: 100,
    dataFreshnessMs: 500,
    isLiquid: true,
    hasAmbiguousResolution: false,
    resolutionAmbiguityScore: 0,
    category: 'test',
    tags: ['test'],
    scannedAt: new Date()
  };
}
