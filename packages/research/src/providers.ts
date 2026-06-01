import { z } from 'zod';

export interface StructuredProvider {
  id: 'openai' | 'anthropic' | 'groq' | 'ollama' | string;
  completeJson(input: ProviderRequest): Promise<unknown>;
}

export interface ProviderRequest {
  system: string;
  user: string;
  schemaName: string;
  timeoutMs: number;
}

export class CircuitBreakerProviderChain {
  private readonly failures = new Map<string, number>();

  constructor(private readonly providers: StructuredProvider[], private readonly maxFailures = 3) {}

  async request<T>(request: ProviderRequest, schema: z.ZodSchema<T>): Promise<T> {
    const errors: string[] = [];
    for (const provider of this.providers) {
      if ((this.failures.get(provider.id) ?? 0) >= this.maxFailures) {
        errors.push(`${provider.id}: circuit open`);
        continue;
      }
      try {
        const parsed = schema.safeParse(await provider.completeJson(request));
        if (!parsed.success) {
          this.recordFailure(provider.id);
          errors.push(`${provider.id}: ${parsed.error.message}`);
          const retry = schema.safeParse(await provider.completeJson(request));
          if (!retry.success) {
            this.recordFailure(provider.id);
            errors.push(`${provider.id} retry: ${retry.error.message}`);
            continue;
          }
          this.reset(provider.id);
          return retry.data;
        }
        this.reset(provider.id);
        return parsed.data;
      } catch (error) {
        this.recordFailure(provider.id);
        errors.push(`${provider.id}: ${error instanceof Error ? error.message : 'unknown provider failure'}`);
      }
    }
    throw new Error(`All structured providers failed: ${errors.join('; ')}`);
  }

  private recordFailure(id: string): void {
    this.failures.set(id, (this.failures.get(id) ?? 0) + 1);
  }

  private reset(id: string): void {
    this.failures.set(id, 0);
  }
}

export class OpenAIJsonProvider implements StructuredProvider {
  id = 'openai' as const;
  constructor(private readonly apiKey: string, private readonly model = 'gpt-4.1-mini') {}

  async completeJson(input: ProviderRequest): Promise<unknown> {
    return postJson('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        input: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }],
        text: { format: { type: 'json_object' } }
      }),
      timeoutMs: input.timeoutMs
    }).then(extractOpenAIJson);
  }
}

export class AnthropicJsonProvider implements StructuredProvider {
  id = 'anthropic' as const;
  constructor(private readonly apiKey: string, private readonly model = 'claude-3-5-sonnet-latest') {}

  async completeJson(input: ProviderRequest): Promise<unknown> {
    return postJson('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1500,
        system: `${input.system}\nReturn only strict JSON for schema ${input.schemaName}.`,
        messages: [{ role: 'user', content: input.user }]
      }),
      timeoutMs: input.timeoutMs
    }).then((payload) => parseProviderText((payload as { content?: Array<{ text?: string }> }).content?.map((c) => c.text).find(Boolean), 'Anthropic'));
  }
}

export class GroqJsonProvider implements StructuredProvider {
  id = 'groq' as const;
  constructor(private readonly apiKey: string, private readonly model = 'llama-3.3-70b-versatile') {}

  async completeJson(input: ProviderRequest): Promise<unknown> {
    return postJson('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }]
      }),
      timeoutMs: input.timeoutMs
    }).then((payload) => parseProviderText((payload as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content, 'Groq'));
  }
}

export class OllamaJsonProvider implements StructuredProvider {
  id = 'ollama' as const;
  constructor(private readonly baseUrl: string, private readonly model = 'llama3.1') {}

  async completeJson(input: ProviderRequest): Promise<unknown> {
    return postJson(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: 'json',
        messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }]
      }),
      timeoutMs: input.timeoutMs
    }).then((payload) => JSON.parse(String((payload as { message?: { content?: string } }).message?.content ?? '{}')));
  }
}

async function postJson(url: string, init: RequestInit & { timeoutMs: number }): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function extractOpenAIJson(payload: unknown): unknown {
  const output = payload as { output?: Array<{ content?: Array<{ text?: string }> }> };
  const text = output.output?.flatMap((item) => item.content ?? []).map((content) => content.text).find(Boolean);
  if (!text) throw new Error('OpenAI response did not include JSON text output');
  return JSON.parse(text);
}

function parseProviderText(text: string | undefined, provider: string): unknown {
  if (!text) throw new Error(`${provider} response did not include text output`);
  return JSON.parse(text);
}
