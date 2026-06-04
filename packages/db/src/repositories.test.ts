import { describe, expect, it } from 'vitest';
import type { ApiClient, CalibrationRecord, FeatureSnapshot, Playbook, Position, Tenant, UsageMetric, User } from '@polyshore/core';
import {
  ApiClientRepository,
  ApiKeyRepository,
  CalibrationRecordRepository,
  ConfigOverrideRepository,
  MarketFeatureRepository,
  MarketMemoryRepository,
  PlaybookRepository,
  ReconciliationIncidentRepository,
  PositionRepository,
  TenantRepository,
  TenantUserRepository,
  UsageMetricRepository,
  UserRepository,
  type ApiKeyRecord,
  type ConfigOverrideRecord,
  type MarketMemoryRecord
} from './repositories';
import { apiClients, apiKeys, calibrationRecords, configOverrides, marketFeatures, marketMemory, playbooks, positions, systemEvents, tenantUsers, tenants, usageMetrics, users } from './schema';

describe('entity repositories', () => {
  it('writes tenant, user, and tenant-user records', async () => {
    const db = new MemoryDb();
    const tenant: Tenant = { id: 'tenant-1', name: 'Tenant', plan: 'private_operator', liveEnabled: false, createdAt: new Date() };
    const user: User = { id: 'user-1', email: 'operator@example.com', displayName: 'Operator', createdAt: new Date() };

    await new TenantRepository(db as never).put(tenant);
    await new UserRepository(db as never).put(user);
    await new TenantUserRepository(db as never).add({ tenantId: tenant.id, userId: user.id, role: 'owner' });

    expect(db.table(tenants)[0]).toEqual(tenant);
    expect(db.table(users)[0]).toEqual(user);
    expect(db.table(tenantUsers)[0]).toEqual({ tenantId: tenant.id, userId: user.id, role: 'owner' });
  });

  it('writes API client, key, playbook, usage, and config records', async () => {
    const db = new MemoryDb();
    const client: ApiClient = { id: 'client-1', tenantId: 'tenant-1', name: 'Client', scopes: ['api:read'], rateLimitPerMinute: 60 };
    const key: ApiKeyRecord = { id: 'key-1', apiClientId: client.id, keyHash: 'hash', createdAt: new Date() };
    const playbook: Playbook = { id: 'playbook-1', tenantId: 'tenant-1', name: 'Default', enabled: true, filters: { category: 'macro' }, mandate: 'conservative' };
    const metric: UsageMetric = { id: 'usage-1', tenantId: 'tenant-1', apiClientId: client.id, route: '/api/signals', units: 1, recordedAt: new Date() };
    const override: ConfigOverrideRecord = { id: 'config-1', tenantId: 'tenant-1', key: 'STRICT_RESOLUTION_MODE', value: true, actorId: 'user-1', oldValue: false, changedAt: new Date() };

    await new ApiClientRepository(db as never).put(client);
    await new ApiKeyRepository(db as never).put(key);
    await new PlaybookRepository(db as never).put(playbook);
    await new UsageMetricRepository(db as never).append(metric);
    await new ConfigOverrideRepository(db as never).append(override);

    expect(db.table(apiClients)[0]).toEqual(client);
    expect(db.table(apiKeys)[0]).toEqual(key);
    expect(db.table(playbooks)[0]).toEqual({ id: playbook.id, tenantId: playbook.tenantId, name: playbook.name, enabled: playbook.enabled, payload: playbook });
    expect(db.table(usageMetrics)[0]).toEqual(metric);
    expect(db.table(configOverrides)[0]).toEqual(override);
  });

  it('stores durable safety state and defaults to blocking when storage fails', async () => {
    const db = new MemoryDb();
    const repository = new ConfigOverrideRepository(db as never);
    const blockedDefault = await repository.readSafetyState('tenant-1');
    const updatedAt = new Date();

    expect(blockedDefault.killSwitchActive).toBe(true);
    expect(blockedDefault.liveAuthorized).toBe(false);

    const killState = await repository.setKillSwitch({ tenantId: 'tenant-1', active: false, reason: 'operator resumed paper mode', actorId: 'operator-1', now: updatedAt });
    expect(killState.killSwitchActive).toBe(false);
    expect(killState.killSwitchReason).toBe('operator resumed paper mode');

    const liveState = await repository.setLiveAuthorization({ tenantId: 'tenant-1', enabled: true, reason: 'dual confirmation complete', actorId: 'operator-1', now: updatedAt });
    expect(liveState.liveAuthorized).toBe(true);
    expect(liveState.liveActivationConfirmedAt?.toISOString()).toBe(updatedAt.toISOString());

    const failedState = await new ConfigOverrideRepository(new FailingDb() as never).readSafetyState('tenant-1');
    expect(failedState.killSwitchActive).toBe(true);
    expect(failedState.liveAuthorized).toBe(false);
    expect(failedState.safetyReadError).toBeTruthy();
  });

  it('writes feature, position, calibration, and memory records', async () => {
    const db = new MemoryDb();
    const feature: FeatureSnapshot = { marketId: 'market-1', window: '1m', volatility: 0.1, momentum: 0, spreadRegime: 'tight', orderFlowImbalance: 0, volumeBurstScore: 1, sentimentVelocity: 0, crossMarketCorrelationScore: 0, catalystProximity: 0.5, macroRegimeLabel: 'test', computedAt: new Date() };
    const position: Position = { id: 'position-1', marketId: 'market-1', side: 'yes', quantity: 10, averagePrice: 0.5, marketValue: 5, category: 'macro', venue: 'kalshi' };
    const calibration: CalibrationRecord = { id: 'calibration-1', marketId: 'market-1', resolvedAt: new Date(), predictedProbability: 0.6, outcome: 1, brierScore: 0.16, directionalAccuracy: true, sharpness: 0.2, modelRecommendations: ['calibrate'] };
    const memory: MarketMemoryRecord = { id: 'memory-1', marketId: 'market-1', question: 'Question', resolutionCriteria: 'Criteria', similarity: 1, outcome: 1, embedding: [0.1, 0.2], createdAt: new Date() };

    await new MarketFeatureRepository(db as never).put(feature);
    await new PositionRepository(db as never).put(position, 'tenant-1');
    await new CalibrationRecordRepository(db as never).put(calibration);
    await new MarketMemoryRepository(db as never).put(memory);

    expect(db.table(marketFeatures)[0]).toEqual({ marketId: feature.marketId, window: feature.window, payload: feature, computedAt: feature.computedAt });
    expect(db.table(positions)[0]).toEqual({ ...position, tenantId: 'tenant-1' });
    expect(db.table(calibrationRecords)[0]).toEqual(calibration);
    expect(db.table(marketMemory)[0]).toEqual({ id: memory.id, marketId: memory.marketId, embedding: memory.embedding, text: `${memory.question}\n${memory.resolutionCriteria}`, outcome: memory.outcome, createdAt: memory.createdAt });
  });

  it('persists reconciliation incident acknowledgment and clear lifecycle', async () => {
    const db = new MemoryDb();
    const repository = new ReconciliationIncidentRepository(db as never);
    const checkedAt = new Date();

    const open = await repository.persistReport('tenant-1', { severe: true, checkedAt });
    const acknowledged = await repository.acknowledge({ tenantId: 'tenant-1', actorId: 'operator-1', reason: 'reviewed venue outage', now: checkedAt });
    const cleared = await repository.clear('tenant-1', 'venue and local state match', 'operator-1', checkedAt);

    expect(open.severeMismatchOpen).toBe(true);
    expect(acknowledged.severeMismatchOpen).toBe(true);
    expect(acknowledged.acknowledged).toBe(true);
    expect(cleared.severeMismatchOpen).toBe(false);
    expect(db.table(systemEvents).map((event) => event.eventType)).toEqual([
      'reconciliation.mismatch_open',
      'reconciliation.mismatch_acknowledged',
      'reconciliation.mismatch_cleared'
    ]);
  });
});

class MemoryDb {
  private readonly rows = new Map<unknown, any[]>();

  table(table: unknown) {
    if (!this.rows.has(table)) this.rows.set(table, []);
    return this.rows.get(table) as any[];
  }

  insert(table: unknown) {
    return {
      values: (value: any) => {
        this.table(table).push(value);
        return { onDuplicateKeyUpdate: async () => undefined, then: (resolve: (value: unknown) => void) => Promise.resolve(undefined).then(resolve) };
      }
    };
  }

  select() {
    return {
      from: (table: unknown) => new MemoryQuery(this.table(table))
    };
  }
}

class FailingDb {
  select() {
    throw new Error('storage unavailable');
  }
}

class MemoryQuery {
  constructor(private readonly rows: any[]) {}
  where() { return this; }
  orderBy() { return this; }
  limit(count: number) { return Promise.resolve(this.rows.slice(0, count)); }
  then(resolve: (rows: any[]) => void) { return Promise.resolve(this.rows).then(resolve); }
}
