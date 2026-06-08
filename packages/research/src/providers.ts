import { z } from 'zod';
import type { MarketDossier, NormalizedMarket } from '@polyshore/core';

export type ResearchProviderStatus = 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'DISABLED';

export interface ResearchProviderHealthRecord {
  name: string;
  status: ResearchProviderStatus;
  checkedAt: Date;
  error?: string;
}

export interface WebResearchResult {
  facts: MarketDossier['currentFacts'];
  contradictions: string[];
  sourceCount: number;
  sourceQuality: number;
  informationAge: number;
}

export interface WebResearchProvider {
  id: 'tavily' | string;
  research(market: NormalizedMarket): Promise<WebResearchResult>;
  probe?(): Promise<void>;
}

export interface LlmReasoningProvider {
  id: 'openai' | 'anthropic' | string;
  reason(market: NormalizedMarket, facts: MarketDossier['currentFacts']): Promise<Partial<MarketDossier>>;
  probe?(): Promise<void>;
}

export interface ResearchProviderConfig {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  TAVILY_API_KEY?: string;
  RESEARCH_PROVIDERS_REQUIRED?: boolean;
}

const ReasoningSchema = z.object({
  probabilityEstimate: z.number().min(0.01).max(0.99),
  probabilityLow: z.number().min(0).max(1),
  probabilityHigh: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  evidenceStrength: z.number().min(0).max(1),
  contraryCase: z.string().min(1),
  steelmanRebuttal: z.string().min(1),
  identifiedBlindSpots: z.array(z.string()).default([])
});

export class TavilyWebResearchProvider implements WebResearchProvider {
  id = 'tavily' as const;
  constructor(private readonly apiKey: string) {}

  async research(market: NormalizedMarket): Promise<WebResearchResult> {
    const payload = await requestJsonWithRetry('https://api.tavily.com/search', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `${market.question} ${market.resolutionCriteria}`,
        search_depth: 'basic',
        include_answer: false,
        max_results: 5
      }),
      timeoutMs: 12_000
    });
    const rows = (payload as { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> }).results ?? [];
    const facts = rows
      .filter((row) => row.title || row.content)
      .map((row) => ({
        claim: String(row.content || row.title).slice(0, 500),
        source: String(row.url || 'tavily'),
        capturedAt: new Date()
      }));
    return {
      facts,
      contradictions: [],
      sourceCount: facts.length,
      sourceQuality: facts.length > 0 ? 0.75 : 0,
      informationAge: 0
    };
  }

  async probe(): Promise<void> {
    await requestJsonWithRetry('https://api.tavily.com/search', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'prediction market research provider health check', max_results: 1, search_depth: 'basic' }),
      timeoutMs: 5_000,
      retries: 0
    });
  }
}

export class OpenAIReasoningProvider implements LlmReasoningProvider {
  id = 'openai' as const;
  constructor(private readonly apiKey: string, private readonly model = 'gpt-4.1-mini') {}

  async reason(market: NormalizedMarket, facts: MarketDossier['currentFacts']): Promise<Partial<MarketDossier>> {
    const payload = await requestJsonWithRetry('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        input: [
          { role: 'system', content: providerSystemPrompt },
          { role: 'user', content: JSON.stringify(reasoningInput(market, facts)) }
        ],
        text: { format: { type: 'json_object' } }
      }),
      timeoutMs: 20_000
    });
    return parseReasoning(extractOpenAIJson(payload));
  }

  async probe(): Promise<void> {
    await requestJsonWithRetry('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        input: 'Return {"ok":true} as JSON.',
        text: { format: { type: 'json_object' } }
      }),
      timeoutMs: 8_000,
      retries: 0
    });
  }
}

export class AnthropicReasoningProvider implements LlmReasoningProvider {
  id = 'anthropic' as const;
  constructor(private readonly apiKey: string, private readonly model = 'claude-3-5-sonnet-latest') {}

  async reason(market: NormalizedMarket, facts: MarketDossier['currentFacts']): Promise<Partial<MarketDossier>> {
    const payload = await requestJsonWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1500,
        system: providerSystemPrompt,
        messages: [{ role: 'user', content: JSON.stringify(reasoningInput(market, facts)) }]
      }),
      timeoutMs: 20_000
    });
    const text = (payload as { content?: Array<{ text?: string }> }).content?.map((item) => item.text).find(Boolean);
    if (!text) throw new Error('Anthropic response did not include text output');
    return parseReasoning(JSON.parse(text));
  }

  async probe(): Promise<void> {
    await requestJsonWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, max_tokens: 50, messages: [{ role: 'user', content: 'Return {"ok":true} as JSON.' }] }),
      timeoutMs: 8_000,
      retries: 0
    });
  }
}

export function configuredResearchProviders(config: ResearchProviderConfig): { webProvider?: WebResearchProvider; reasoningProvider?: LlmReasoningProvider } {
  return {
    webProvider: config.TAVILY_API_KEY ? new TavilyWebResearchProvider(config.TAVILY_API_KEY) : undefined,
    reasoningProvider: config.OPENAI_API_KEY ? new OpenAIReasoningProvider(config.OPENAI_API_KEY) : config.ANTHROPIC_API_KEY ? new AnthropicReasoningProvider(config.ANTHROPIC_API_KEY) : undefined
  };
}

export async function checkResearchProviderHealth(config: ResearchProviderConfig, probe = true): Promise<ResearchProviderHealthRecord[]> {
  const required = config.RESEARCH_PROVIDERS_REQUIRED === true;
  const providers = configuredResearchProviders(config);
  return Promise.all([
    healthFor('research:web', providers.webProvider, required, probe),
    healthFor('research:llm', providers.reasoningProvider, required, probe)
  ]);
}

export async function requestJsonWithRetry(url: string, init: RequestInit & { timeoutMs: number; retries?: number; backoffMs?: number }): Promise<unknown> {
  const retries = init.retries ?? 2;
  const backoffMs = init.backoffMs ?? 250;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestJson(url, init);
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryableProviderError(error)) break;
      await sleep(backoffMs * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function requestJson(url: string, init: RequestInit & { timeoutMs: number }): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('provider request timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function healthFor(name: string, provider: { probe?(): Promise<void> } | undefined, required: boolean, probe: boolean): Promise<ResearchProviderHealthRecord> {
  if (!provider) return { name, status: required ? 'FAILED' : 'DEGRADED', checkedAt: new Date(), error: 'provider not configured' };
  if (!probe || !provider.probe) return { name, status: 'HEALTHY', checkedAt: new Date() };
  try {
    await provider.probe();
    return { name, status: 'HEALTHY', checkedAt: new Date() };
  } catch (error) {
    return { name, status: required ? 'FAILED' : 'DEGRADED', checkedAt: new Date(), error: error instanceof Error ? error.message : String(error) };
  }
}

function parseReasoning(payload: unknown): Partial<MarketDossier> {
  return ReasoningSchema.parse(payload);
}

function extractOpenAIJson(payload: unknown): unknown {
  const output = payload as { output?: Array<{ content?: Array<{ text?: string }> }> };
  const text = output.output?.flatMap((item) => item.content ?? []).map((content) => content.text).find(Boolean);
  if (!text) throw new Error('OpenAI response did not include JSON text output');
  return JSON.parse(text);
}

function reasoningInput(market: NormalizedMarket, facts: MarketDossier['currentFacts']) {
  return {
    market: {
      id: market.id,
      question: market.question,
      resolutionCriteria: market.resolutionCriteria,
      category: market.category,
      midpoint: market.midpoint
    },
    facts
  };
}

function isRetryableProviderError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /HTTP (408|409|425|429|5\d\d)\b|timeout|timed out|ECONNRESET|ECONNREFUSED|network/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const providerSystemPrompt = [
  'You are a prediction-market research analyst.',
  'Return strict JSON only.',
  'Do not invent facts.',
  'If evidence is weak, lower confidence and identify blind spots.',
  'Required keys: probabilityEstimate, probabilityLow, probabilityHigh, confidence, evidenceStrength, contraryCase, steelmanRebuttal, identifiedBlindSpots.'
].join(' ');
