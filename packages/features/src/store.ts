import type { FeatureSnapshot } from '@polyshore/core';

export interface FeatureStore {
  put(snapshot: FeatureSnapshot): Promise<void>;
  get(marketId: string, window: FeatureSnapshot['window']): Promise<FeatureSnapshot | null>;
}

export class RedisFeatureStore implements FeatureStore {
  constructor(private readonly client: { get(key: string): Promise<string | null>; set(key: string, value: string, options?: unknown): Promise<unknown> }) {}

  async put(snapshot: FeatureSnapshot): Promise<void> {
    await this.client.set(key(snapshot.marketId, snapshot.window), JSON.stringify(snapshot), { EX: 60 * 60 });
  }

  async get(marketId: string, window: FeatureSnapshot['window']): Promise<FeatureSnapshot | null> {
    const raw = await this.client.get(key(marketId, window));
    return raw ? reviveFeatureSnapshot(JSON.parse(raw) as FeatureSnapshot) : null;
  }
}

function key(marketId: string, window: FeatureSnapshot['window']): string {
  return `feature:${marketId}:${window}`;
}

function reviveFeatureSnapshot(snapshot: FeatureSnapshot): FeatureSnapshot {
  return { ...snapshot, computedAt: new Date(snapshot.computedAt) };
}
