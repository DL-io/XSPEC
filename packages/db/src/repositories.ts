import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { AlertEvent, ApiClient, CalibrationRecord, DecisionAudit, ExecutionAuditResult, FeatureSnapshot, MarketDossier, MemoryMatch, NewOrder, NormalizedMarket, OrderLifecycleState, Playbook, PortfolioState, Position, ReconciliationAuditStatus, ResearchPack, Tenant, UsageMetric, User } from '@polyshore/core';
import type { LiveOrderStore } from '@polyshore/execution';
import type { OmegaDb } from './client';
import { apiClients, apiKeys, calibrationRecords, configOverrides, decisionAudits, dossiers, marketFeatures, marketMemory, markets, orders, orderStateTransitions, playbooks, positions, portfolioSnapshots, researchPacks, systemEvents, tenantUsers, tenants, usageMetrics, users } from './schema';

export interface TenantUserRecord { id?: number; tenantId: string; userId: string; role: string; }
export interface ApiKeyRecord { id: string; apiClientId: string; keyHash: string; createdAt: Date; }
export interface ConfigOverrideRecord { id: string; tenantId: string; key: string; value: unknown; actorId: string; oldValue?: unknown; changedAt: Date; }
export interface MarketMemoryRecord extends MemoryMatch { id: string; embedding: unknown; createdAt: Date; }
export type AuditEventType = 'execution_result' | 'reconciliation_status';
export interface AuditEventRecord { id: string; auditId: string; tenantId: string; marketId: string; type: AuditEventType; payload: unknown; createdAt: Date; }
export interface LocalOrderReconciliationRecord { venueOrderId: string; state: string; filledQuantity: number; averagePrice?: number; }
export interface ReconciliationIncidentRecord { id: string; tenantId: string; report: unknown; acknowledgedAt?: Date; acknowledgedBy?: string; acknowledgmentReason?: string; clearedAt?: Date; clearReason?: string; createdAt: Date; updatedAt: Date; }
export interface ReconciliationState { tenantId: string; severeMismatchOpen: boolean; incident?: ReconciliationIncidentRecord; acknowledged: boolean; }
export interface WorkerHealthRecord { worker: string; status: 'ok' | 'error'; lastHeartbeatAt: Date; lastSuccessAt?: Date; lastError?: string; metadata?: Record<string, unknown>; }
export interface SafetyState {
  tenantId: string;
  killSwitchActive: boolean;
  killSwitchReason: string;
  killSwitchActorId?: string;
  killSwitchUpdatedAt?: Date;
  liveAuthorized: boolean;
  liveAuthorizationReason?: string;
  liveAuthorizationActorId?: string;
  liveActivationConfirmedAt?: Date;
  safetyReadError?: string;
}

const KILL_SWITCH_KEY = 'safety.kill_switch';
const LIVE_AUTHORIZATION_KEY = 'safety.live_authorization';
const RECONCILIATION_MISMATCH_OPEN = 'reconciliation.mismatch_open';
const RECONCILIATION_MISMATCH_ACKNOWLEDGED = 'reconciliation.mismatch_acknowledged';
const RECONCILIATION_MISMATCH_CLEARED = 'reconciliation.mismatch_cleared';

export class MarketRepository {
  constructor(private readonly db: OmegaDb) {}

  async upsertMarket(market: NormalizedMarket): Promise<void> {
    await this.db.insert(markets).values({
      id: market.id,
      source: market.source,
      externalId: market.externalId,
      slug: market.slug,
      question: market.question,
      resolutionCriteria: market.resolutionCriteria,
      resolutionDate: market.resolutionDate,
      status: market.status,
      bestBid: market.bestBid,
      bestAsk: market.bestAsk,
      spread: market.spread,
      spreadBps: market.spreadBps,
      midpoint: market.midpoint,
      totalLiquidity: market.totalLiquidity,
      volume24h: market.volume24h,
      category: market.category,
      tags: market.tags,
      scannedAt: market.scannedAt
    }).onDuplicateKeyUpdate({
      set: {
        bestBid: market.bestBid,
        bestAsk: market.bestAsk,
        spread: market.spread,
        spreadBps: market.spreadBps,
        midpoint: market.midpoint,
        totalLiquidity: market.totalLiquidity,
        volume24h: market.volume24h,
        status: market.status,
        scannedAt: market.scannedAt
      }
    });
  }
}

export class TenantRepository {
  constructor(private readonly db: OmegaDb) {}

  async put(tenant: Tenant): Promise<void> {
    await this.db.insert(tenants).values(tenant).onDuplicateKeyUpdate({
      set: { name: tenant.name, plan: tenant.plan, liveEnabled: tenant.liveEnabled }
    });
  }

  async get(id: string): Promise<Tenant | null> {
    const rows = await this.db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    return rows[0] as Tenant | undefined ?? null;
  }
}

export class UserRepository {
  constructor(private readonly db: OmegaDb) {}

  async put(user: User): Promise<void> {
    await this.db.insert(users).values(user).onDuplicateKeyUpdate({
      set: { email: user.email, displayName: user.displayName }
    });
  }

  async get(id: string): Promise<User | null> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] as User | undefined ?? null;
  }

  async getByEmail(email: string): Promise<User | null> {
    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0] as User | undefined ?? null;
  }
}

export class TenantUserRepository {
  constructor(private readonly db: OmegaDb) {}

  async add(record: TenantUserRecord): Promise<void> {
    await this.db.insert(tenantUsers).values({
      tenantId: record.tenantId,
      userId: record.userId,
      role: record.role
    });
  }

  async listForTenant(tenantId: string): Promise<TenantUserRecord[]> {
    const rows = await this.db.select().from(tenantUsers).where(eq(tenantUsers.tenantId, tenantId));
    return rows as TenantUserRecord[];
  }
}

export class ApiClientRepository {
  constructor(private readonly db: OmegaDb) {}

  async put(client: ApiClient): Promise<void> {
    await this.db.insert(apiClients).values(client).onDuplicateKeyUpdate({
      set: { name: client.name, scopes: client.scopes, rateLimitPerMinute: client.rateLimitPerMinute }
    });
  }

  async listForTenant(tenantId: string): Promise<ApiClient[]> {
    const rows = await this.db.select().from(apiClients).where(eq(apiClients.tenantId, tenantId));
    return rows as ApiClient[];
  }
}

export class ApiKeyRepository {
  constructor(private readonly db: OmegaDb) {}

  async put(key: ApiKeyRecord): Promise<void> {
    await this.db.insert(apiKeys).values(key);
  }

  async listForClient(apiClientId: string): Promise<ApiKeyRecord[]> {
    const rows = await this.db.select().from(apiKeys).where(eq(apiKeys.apiClientId, apiClientId));
    return rows as ApiKeyRecord[];
  }

  async validate(input: { tenantId: string; rawKey: string; requiredScope: string }): Promise<{ apiClientId: string; scopes: string[] } | null> {
    const clients = await new ApiClientRepository(this.db).listForTenant(input.tenantId);
    const keyHash = hashApiKey(input.rawKey);
    for (const client of clients) {
      if (!client.scopes.includes(input.requiredScope) && !client.scopes.includes('*')) continue;
      const keys = await this.listForClient(client.id);
      if (keys.some((key) => key.keyHash === keyHash)) return { apiClientId: client.id, scopes: client.scopes };
    }
    return null;
  }
}

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export class PlaybookRepository {
  constructor(private readonly db: OmegaDb) {}

  async put(playbook: Playbook): Promise<void> {
    await this.db.insert(playbooks).values({
      id: playbook.id,
      tenantId: playbook.tenantId,
      name: playbook.name,
      enabled: playbook.enabled,
      payload: playbook
    }).onDuplicateKeyUpdate({
      set: { name: playbook.name, enabled: playbook.enabled, payload: playbook }
    });
  }

  async listForTenant(tenantId: string): Promise<Playbook[]> {
    const rows = await this.db.select().from(playbooks).where(eq(playbooks.tenantId, tenantId));
    return rows.map((row) => row.payload as Playbook);
  }
}

export class UsageMetricRepository {
  constructor(private readonly db: OmegaDb) {}

  async append(metric: UsageMetric): Promise<void> {
    await this.db.insert(usageMetrics).values(metric);
  }

  async listForTenant(tenantId: string): Promise<UsageMetric[]> {
    const rows = await this.db.select().from(usageMetrics).where(eq(usageMetrics.tenantId, tenantId));
    return rows as UsageMetric[];
  }
}

export class ConfigOverrideRepository {
  constructor(private readonly db: OmegaDb) {}

  async append(record: ConfigOverrideRecord): Promise<void> {
    await this.db.insert(configOverrides).values(record);
  }

  async listForTenant(tenantId: string): Promise<ConfigOverrideRecord[]> {
    const rows = await this.db.select().from(configOverrides).where(eq(configOverrides.tenantId, tenantId)).orderBy(desc(configOverrides.changedAt));
    return rows as ConfigOverrideRecord[];
  }

  async readSafetyState(tenantId: string): Promise<SafetyState> {
    try {
      const records = await this.listForTenant(tenantId);
      const killSwitch = records.find((record) => record.key === KILL_SWITCH_KEY);
      const liveAuthorization = records.find((record) => record.key === LIVE_AUTHORIZATION_KEY);
      return {
        tenantId,
        ...safetyKillSwitchFromRecord(killSwitch),
        ...safetyLiveAuthorizationFromRecord(liveAuthorization)
      };
    } catch (error) {
      return defaultSafetyState(tenantId, error instanceof Error ? error.message : String(error));
    }
  }

  async setKillSwitch(input: { tenantId: string; active: boolean; reason: string; actorId?: string; now?: Date }): Promise<SafetyState> {
    const current = await this.readSafetyState(input.tenantId);
    const changedAt = input.now ?? new Date();
    await this.append({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      key: KILL_SWITCH_KEY,
      value: { active: input.active, reason: input.reason, actorId: input.actorId, updatedAt: changedAt.toISOString() },
      actorId: input.actorId ?? 'system',
      oldValue: { active: current.killSwitchActive, reason: current.killSwitchReason, actorId: current.killSwitchActorId, updatedAt: current.killSwitchUpdatedAt?.toISOString() },
      changedAt
    });
    return this.readSafetyState(input.tenantId);
  }

  async setLiveAuthorization(input: { tenantId: string; enabled: boolean; reason: string; actorId?: string; now?: Date }): Promise<SafetyState> {
    const current = await this.readSafetyState(input.tenantId);
    const changedAt = input.now ?? new Date();
    await this.append({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      key: LIVE_AUTHORIZATION_KEY,
      value: { enabled: input.enabled, reason: input.reason, actorId: input.actorId, confirmedAt: input.enabled ? changedAt.toISOString() : undefined },
      actorId: input.actorId ?? 'system',
      oldValue: { enabled: current.liveAuthorized, reason: current.liveAuthorizationReason, actorId: current.liveAuthorizationActorId, confirmedAt: current.liveActivationConfirmedAt?.toISOString() },
      changedAt
    });
    return this.readSafetyState(input.tenantId);
  }
}

function defaultSafetyState(tenantId: string, safetyReadError?: string): SafetyState {
  return {
    tenantId,
    killSwitchActive: true,
    killSwitchReason: safetyReadError ? 'safety state read failed' : 'safety state not initialized',
    liveAuthorized: false,
    safetyReadError
  };
}

function safetyKillSwitchFromRecord(record?: ConfigOverrideRecord) {
  if (!record) return { killSwitchActive: true, killSwitchReason: 'safety state not initialized' };
  const value = record.value as { active?: unknown; reason?: unknown; actorId?: unknown; updatedAt?: unknown };
  return {
    killSwitchActive: value.active === false ? false : true,
    killSwitchReason: typeof value.reason === 'string' && value.reason.length > 0 ? value.reason : 'kill switch state updated',
    killSwitchActorId: typeof value.actorId === 'string' ? value.actorId : record.actorId,
    killSwitchUpdatedAt: new Date(typeof value.updatedAt === 'string' ? value.updatedAt : record.changedAt)
  };
}

function safetyLiveAuthorizationFromRecord(record?: ConfigOverrideRecord) {
  if (!record) return { liveAuthorized: false };
  const value = record.value as { enabled?: unknown; reason?: unknown; actorId?: unknown; confirmedAt?: unknown };
  return {
    liveAuthorized: value.enabled === true,
    liveAuthorizationReason: typeof value.reason === 'string' ? value.reason : undefined,
    liveAuthorizationActorId: typeof value.actorId === 'string' ? value.actorId : record.actorId,
    liveActivationConfirmedAt: value.enabled === true && typeof value.confirmedAt === 'string' ? new Date(value.confirmedAt) : undefined
  };
}

export class MarketFeatureRepository {
  constructor(private readonly db: OmegaDb) {}

  async put(snapshot: FeatureSnapshot): Promise<void> {
    await this.db.insert(marketFeatures).values({
      marketId: snapshot.marketId,
      window: snapshot.window,
      payload: snapshot,
      computedAt: snapshot.computedAt
    });
  }

  async latest(marketId: string, window: FeatureSnapshot['window']): Promise<FeatureSnapshot | null> {
    const rows = await this.db.select().from(marketFeatures).where(and(eq(marketFeatures.marketId, marketId), eq(marketFeatures.window, window))).orderBy(desc(marketFeatures.computedAt)).limit(1);
    return rows[0]?.payload as FeatureSnapshot | undefined ?? null;
  }
}

export class DossierRepository {
  constructor(private readonly db: OmegaDb) {}

  async put(dossier: MarketDossier): Promise<string> {
    const id = dossierId(dossier);
    await this.db.insert(dossiers).values({
      id,
      marketId: dossier.marketId,
      payload: dossier,
      generatedAt: dossier.generatedAt,
      freshnessExpiresAt: dossier.freshnessExpiresAt
    });
    return id;
  }

  async latest(marketId: string): Promise<MarketDossier | null> {
    const rows = await this.db.select().from(dossiers).where(eq(dossiers.marketId, marketId)).orderBy(desc(dossiers.generatedAt)).limit(1);
    return rows[0]?.payload as MarketDossier | undefined ?? null;
  }
}

export function dossierId(dossier: Pick<MarketDossier, 'marketId' | 'generatedAt'>): string {
  return `${dossier.marketId}:${dossier.generatedAt.toISOString()}`;
}

export class DecisionAuditRepository {
  constructor(private readonly db: OmegaDb) {}

  async append(record: DecisionAudit): Promise<void> {
    await this.db.insert(decisionAudits).values({
      id: record.id,
      tenantId: record.tenantId,
      marketId: record.marketId,
      payload: record,
      finalOutcome: record.finalOutcome,
      createdAt: record.createdAt
    });
  }

  async latestForTenant(tenantId: string, limit = 100): Promise<DecisionAudit[]> {
    const rows = await this.db.select().from(decisionAudits).where(eq(decisionAudits.tenantId, tenantId)).orderBy(desc(decisionAudits.createdAt)).limit(limit);
    return Promise.all(rows.map((row) => this.hydrateAudit(row.payload as DecisionAudit)));
  }

  async approvedPendingExecution(tenantId: string, limit = 50): Promise<DecisionAudit[]> {
    const audits = await this.latestForTenant(tenantId, limit);
    return audits.filter((audit) => audit.finalOutcome === 'trade' && audit.riskDecision?.approved && !audit.executionResult);
  }

  async markExecutionResult(auditId: string, executionResult: ExecutionAuditResult): Promise<void> {
    await this.appendAuditEvent(auditId, 'execution_result', executionResult);
  }

  async markReconciliationStatus(auditId: string, reconciliationStatus: ReconciliationAuditStatus): Promise<void> {
    await this.appendAuditEvent(auditId, 'reconciliation_status', reconciliationStatus);
  }

  async appendAuditEvent(auditId: string, type: AuditEventType, payload: unknown): Promise<void> {
    const rows = await this.db.select().from(decisionAudits).where(eq(decisionAudits.id, auditId)).limit(1);
    const existing = rows[0]?.payload as DecisionAudit | undefined;
    if (!existing) throw new Error(`Decision audit ${auditId} not found`);
    const event: AuditEventRecord = {
      id: `audit-event:${auditId}:${crypto.randomUUID()}`,
      auditId,
      tenantId: existing.tenantId,
      marketId: existing.marketId,
      type,
      payload,
      createdAt: new Date()
    };
    await this.db.insert(systemEvents).values({
      id: event.id,
      tenantId: event.tenantId,
      severity: 'info',
      eventType: `audit.${event.type}`,
      payload: event,
      createdAt: event.createdAt
    });
  }

  async listAuditEvents(auditId: string): Promise<AuditEventRecord[]> {
    const rows = await this.db.select().from(systemEvents);
    return rows
      .filter((row) => typeof row.eventType === 'string' && row.eventType.startsWith('audit.'))
      .map((row) => row.payload as AuditEventRecord)
      .filter((event) => event.auditId === auditId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getAuditWithEvents(auditId: string): Promise<DecisionAudit | null> {
    const rows = await this.db.select().from(decisionAudits).where(eq(decisionAudits.id, auditId)).limit(1);
    const audit = rows[0]?.payload as DecisionAudit | undefined;
    return audit ? this.hydrateAudit(audit) : null;
  }

  private async hydrateAudit(audit: DecisionAudit): Promise<DecisionAudit> {
    const events = await this.listAuditEvents(audit.id);
    return events.reduce((current, event) => {
      if (event.type === 'execution_result') return { ...current, executionResult: event.payload as ExecutionAuditResult };
      if (event.type === 'reconciliation_status') return { ...current, reconciliationStatus: event.payload as ReconciliationAuditStatus };
      return current;
    }, { ...audit });
  }
}

export class ResearchPackRepository {
  constructor(private readonly db: OmegaDb) {}

  async put(pack: ResearchPack): Promise<void> {
    await this.db.insert(researchPacks).values({
      id: pack.id,
      tenantId: pack.tenantId,
      title: pack.title,
      marketIds: pack.marketIds,
      html: pack.html,
      createdAt: pack.createdAt
    });
  }

  async listForTenant(tenantId: string, limit = 25): Promise<ResearchPack[]> {
    const rows = await this.db.select().from(researchPacks).where(eq(researchPacks.tenantId, tenantId)).orderBy(desc(researchPacks.createdAt)).limit(limit);
    return rows as ResearchPack[];
  }
}

export class OrderRepository implements LiveOrderStore {
  constructor(private readonly db: OmegaDb, private readonly tenantId: string) {}

  async get(orderId: string): Promise<{ id: string; state: OrderLifecycleState; venueOrderId?: string | null } | null> {
    const rows = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    return rows[0] as { id: string; state: OrderLifecycleState; venueOrderId?: string | null } | undefined ?? null;
  }

  async createIntent(order: NewOrder, idempotencyKey?: string): Promise<string> {
    const orderId = idempotencyKey ?? crypto.randomUUID();
    const existing = await this.get(orderId);
    if (existing) return existing.id;
    await this.db.insert(orders).values({
      id: orderId,
      tenantId: this.tenantId,
      marketId: order.marketId,
      side: order.side,
      quantity: order.quantity,
      limitPrice: order.limitPrice,
      state: 'INTENT_CREATED',
      createdAt: new Date()
    });
    await this.recordTransition(orderId, 'INTENT_CREATED', 'order intent created');
    return orderId;
  }

  async recordTransition(orderId: string, to: OrderLifecycleState, reason: string, venueOrderId?: string): Promise<void> {
    const current = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const fromState = current[0]?.state;
    await this.db.insert(orderStateTransitions).values({
      id: crypto.randomUUID(),
      orderId,
      fromState,
      toState: to,
      reason,
      createdAt: new Date()
    });
    await this.db.update(orders).set({ state: to, venueOrderId: venueOrderId ?? current[0]?.venueOrderId }).where(eq(orders.id, orderId));
  }

  async persistVenueOrderId(orderId: string, venueOrderId: string): Promise<void> {
    await this.db.update(orders).set({ venueOrderId }).where(eq(orders.id, orderId));
  }

  async listForReconciliation(): Promise<LocalOrderReconciliationRecord[]> {
    const rows = await this.db.select().from(orders).where(eq(orders.tenantId, this.tenantId));
    return rows
      .filter((row) => typeof row.venueOrderId === 'string' && row.venueOrderId.length > 0)
      .map((row) => ({
        venueOrderId: row.venueOrderId as string,
        state: row.state,
        filledQuantity: filledQuantityFromOrderState(row.state, row.quantity),
        averagePrice: row.limitPrice
      }));
  }

  async listForTenant(limit = 100) {
    const rows = await this.db.select().from(orders).where(eq(orders.tenantId, this.tenantId)).orderBy(desc(orders.createdAt)).limit(limit);
    return rows;
  }
}

function filledQuantityFromOrderState(state: string, quantity: number): number {
  return state === 'FILLED' ? quantity : 0;
}

export class PerformanceRepository {
  constructor(private readonly db: OmegaDb) {}

  async calibrationSummary(input: { from?: Date; to?: Date }) {
    const filters = [
      input.from ? gte(calibrationRecords.resolvedAt, input.from) : undefined,
      input.to ? lte(calibrationRecords.resolvedAt, input.to) : undefined
    ].filter((filter) => filter !== undefined);
    const query = this.db.select().from(calibrationRecords);
    const rows = filters.length ? await query.where(and(...filters)) : await query;
    if (!rows.length) return { count: 0, brierScore: null, directionalAccuracy: null, sharpness: null };
    return {
      count: rows.length,
      brierScore: rows.reduce((sum, row) => sum + row.brierScore, 0) / rows.length,
      directionalAccuracy: rows.filter((row) => row.directionalAccuracy).length / rows.length,
      sharpness: rows.reduce((sum, row) => sum + row.sharpness, 0) / rows.length
    };
  }
}

export class PositionRepository {
  constructor(private readonly db: OmegaDb) {}

  async put(position: Position, tenantId: string): Promise<void> {
    await this.db.insert(positions).values({ ...position, tenantId }).onDuplicateKeyUpdate({
      set: {
        quantity: position.quantity,
        averagePrice: position.averagePrice,
        marketValue: position.marketValue,
        category: position.category
      }
    });
  }

  async listForTenant(tenantId: string): Promise<Position[]> {
    const rows = await this.db.select().from(positions).where(eq(positions.tenantId, tenantId));
    return rows.map(({ tenantId: _tenantId, ...position }) => position as Position);
  }
}

export class CalibrationRecordRepository {
  constructor(private readonly db: OmegaDb) {}

  async put(record: CalibrationRecord): Promise<void> {
    await this.db.insert(calibrationRecords).values(record).onDuplicateKeyUpdate({
      set: {
        predictedProbability: record.predictedProbability,
        outcome: record.outcome,
        brierScore: record.brierScore,
        directionalAccuracy: record.directionalAccuracy,
        sharpness: record.sharpness,
        modelRecommendations: record.modelRecommendations,
        resolvedAt: record.resolvedAt
      }
    });
  }

  async listForMarket(marketId: string): Promise<CalibrationRecord[]> {
    const rows = await this.db.select().from(calibrationRecords).where(eq(calibrationRecords.marketId, marketId)).orderBy(desc(calibrationRecords.resolvedAt));
    return rows as CalibrationRecord[];
  }
}

export class MarketMemoryRepository {
  constructor(private readonly db: OmegaDb) {}

  async put(record: MarketMemoryRecord): Promise<void> {
    await this.db.insert(marketMemory).values({
      id: record.id,
      marketId: record.marketId,
      embedding: record.embedding,
      text: `${record.question}\n${record.resolutionCriteria}`,
      outcome: record.outcome,
      createdAt: record.createdAt
    });
  }

  async listForMarket(marketId: string): Promise<MarketMemoryRecord[]> {
    const rows = await this.db.select().from(marketMemory).where(eq(marketMemory.marketId, marketId)).orderBy(desc(marketMemory.createdAt));
    return rows.map((row) => ({
      id: row.id,
      marketId: row.marketId,
      question: row.text,
      resolutionCriteria: row.text,
      similarity: 1,
      outcome: row.outcome === null ? undefined : row.outcome as 0 | 1 | undefined,
      embedding: row.embedding,
      createdAt: row.createdAt
    }));
  }
}

export class PortfolioRepository {
  constructor(private readonly db: OmegaDb) {}

  async latest(tenantId: string): Promise<PortfolioState | null> {
    const rows = await this.db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.tenantId, tenantId)).orderBy(desc(portfolioSnapshots.capturedAt)).limit(1);
    return rows[0]?.payload as PortfolioState | undefined ?? null;
  }

  async history(tenantId: string, limit = 50): Promise<Array<PortfolioState & { capturedAt: Date }>> {
    const rows = await this.db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.tenantId, tenantId)).orderBy(desc(portfolioSnapshots.capturedAt)).limit(limit);
    return rows
      .map((row) => ({ ...(row.payload as PortfolioState), capturedAt: row.capturedAt }))
      .reverse();
  }

  async put(snapshot: PortfolioState): Promise<void> {
    await this.db.insert(portfolioSnapshots).values({
      id: crypto.randomUUID(),
      tenantId: snapshot.tenantId,
      payload: snapshot,
      capturedAt: snapshot.reconciledAt ?? new Date()
    });
  }

  async markSevereMismatch(tenantId: string, severeMismatchOpen: boolean): Promise<void> {
    const current = await this.latest(tenantId);
    const snapshot: PortfolioState = current
      ? { ...current, severeMismatchOpen, reconciledAt: new Date() }
      : { tenantId, cash: 0, equity: 0, totalExposure: 0, categoryExposure: {}, positions: [], openOrderCount: 0, dailyPnl: 0, maxDrawdown: 0, severeMismatchOpen, reconciledAt: new Date() };
    await this.put(snapshot);
  }
}

export class ReconciliationIncidentRepository {
  constructor(private readonly db: OmegaDb) {}

  async persistReport(tenantId: string, report: { severe: boolean; checkedAt: Date }): Promise<ReconciliationState> {
    if (report.severe) {
      const existing = await this.openIncident(tenantId);
      const now = report.checkedAt;
      const incident: ReconciliationIncidentRecord = {
        id: existing?.id ?? `reconciliation:${tenantId}:${now.toISOString()}`,
        tenantId,
        report,
        acknowledgedAt: existing?.acknowledgedAt,
        acknowledgedBy: existing?.acknowledgedBy,
        acknowledgmentReason: existing?.acknowledgmentReason,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
      await this.appendIncidentEvent(RECONCILIATION_MISMATCH_OPEN, tenantId, incident, 'critical', now);
      return { tenantId, severeMismatchOpen: true, incident, acknowledged: Boolean(incident.acknowledgedAt) };
    }
    const existing = await this.openIncident(tenantId);
    if (existing) await this.clear(tenantId, 'venue and local state reconciled', 'system', report.checkedAt, report);
    return this.state(tenantId);
  }

  async state(tenantId: string): Promise<ReconciliationState> {
    const incident = await this.openIncident(tenantId);
    return { tenantId, severeMismatchOpen: Boolean(incident), incident: incident ?? undefined, acknowledged: Boolean(incident?.acknowledgedAt) };
  }

  async acknowledge(input: { tenantId: string; actorId: string; reason: string; now?: Date }): Promise<ReconciliationState> {
    const incident = await this.openIncident(input.tenantId);
    if (!incident) return { tenantId: input.tenantId, severeMismatchOpen: false, acknowledged: false };
    const now = input.now ?? new Date();
    const acknowledged = { ...incident, acknowledgedAt: now, acknowledgedBy: input.actorId, acknowledgmentReason: input.reason, updatedAt: now };
    await this.appendIncidentEvent(RECONCILIATION_MISMATCH_ACKNOWLEDGED, input.tenantId, acknowledged, 'warning', now);
    return { tenantId: input.tenantId, severeMismatchOpen: true, incident: acknowledged, acknowledged: true };
  }

  async clear(tenantId: string, reason: string, actorId = 'system', now = new Date(), report?: unknown): Promise<ReconciliationState> {
    const incident = await this.openIncident(tenantId);
    if (!incident) return { tenantId, severeMismatchOpen: false, acknowledged: false };
    const cleared: ReconciliationIncidentRecord = { ...incident, report: report ?? incident.report, clearedAt: now, clearReason: reason, updatedAt: now };
    await this.appendIncidentEvent(RECONCILIATION_MISMATCH_CLEARED, tenantId, { ...cleared, clearedBy: actorId }, 'info', now);
    return { tenantId, severeMismatchOpen: false, acknowledged: Boolean(cleared.acknowledgedAt) };
  }

  private async openIncident(tenantId: string): Promise<ReconciliationIncidentRecord | null> {
    const events = await this.incidentEvents(tenantId);
    let current: ReconciliationIncidentRecord | null = null;
    for (const event of events) {
      if (event.eventType === RECONCILIATION_MISMATCH_OPEN) {
        current = event.payload as ReconciliationIncidentRecord;
      }
      if (event.eventType === RECONCILIATION_MISMATCH_ACKNOWLEDGED && current) {
        const next = event.payload as ReconciliationIncidentRecord;
        if (next.id === current.id) current = { ...current, ...next };
      }
      if (event.eventType === RECONCILIATION_MISMATCH_CLEARED && current) {
        const next = event.payload as ReconciliationIncidentRecord;
        if (next.id === current.id) current = null;
      }
    }
    return current;
  }

  private async incidentEvents(tenantId: string) {
    const rows = await this.db.select().from(systemEvents).where(eq(systemEvents.tenantId, tenantId));
    return rows
      .filter((row) => row.tenantId === tenantId)
      .filter((row) => [RECONCILIATION_MISMATCH_OPEN, RECONCILIATION_MISMATCH_ACKNOWLEDGED, RECONCILIATION_MISMATCH_CLEARED].includes(row.eventType))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  private async appendIncidentEvent(eventType: string, tenantId: string, payload: unknown, severity: 'critical' | 'warning' | 'info', createdAt: Date): Promise<void> {
    await this.db.insert(systemEvents).values({
      id: `${eventType}:${tenantId}:${crypto.randomUUID()}`,
      tenantId,
      severity,
      eventType,
      payload,
      createdAt
    });
  }
}

export class SystemEventRepository {
  constructor(private readonly db: OmegaDb) {}

  async appendAlert(event: AlertEvent): Promise<void> {
    await this.db.insert(systemEvents).values({
      id: event.id,
      tenantId: event.tenantId,
      severity: event.severity,
      eventType: event.eventType,
      payload: event,
      createdAt: event.createdAt
    });
  }

  async listAlerts(tenantId: string, limit = 100): Promise<AlertEvent[]> {
    const rows = await this.db.select().from(systemEvents).where(eq(systemEvents.tenantId, tenantId)).orderBy(desc(systemEvents.createdAt)).limit(limit);
    return rows.filter((row) => row.eventType !== 'worker.health').map((row) => row.payload as AlertEvent);
  }

  async pendingAlerts(limit = 100): Promise<AlertEvent[]> {
    const rows = await this.db.select().from(systemEvents).orderBy(desc(systemEvents.createdAt)).limit(limit);
    const dispatched = new Set(
      rows
        .filter((row) => row.eventType === 'alert.dispatched')
        .map((row) => (row.payload as { alertId?: string }).alertId)
        .filter((id): id is string => typeof id === 'string')
    );
    return rows
      .filter((row) => row.eventType !== 'worker.health' && row.eventType !== 'alert.dispatched')
      .map((row) => row.payload as AlertEvent)
      .filter((event) => event.id && !dispatched.has(event.id));
  }

  async markAlertDispatched(event: AlertEvent, sinkCount: number): Promise<void> {
    await this.db.insert(systemEvents).values({
      id: `alert-dispatched:${event.id}:${crypto.randomUUID()}`,
      tenantId: event.tenantId,
      severity: 'info',
      eventType: 'alert.dispatched',
      payload: { alertId: event.id, sinkCount, dispatchedAt: new Date() },
      createdAt: new Date()
    });
  }
}

export class WorkerHealthRepository {
  constructor(private readonly db: OmegaDb) {}

  async heartbeat(input: WorkerHealthRecord): Promise<void> {
    await this.db.insert(systemEvents).values({
      id: `worker-health:${input.worker}:${input.lastHeartbeatAt.toISOString()}`,
      tenantId: null,
      severity: input.status === 'ok' ? 'info' : 'warning',
      eventType: 'worker.health',
      payload: input,
      createdAt: input.lastHeartbeatAt
    });
  }

  async latest(): Promise<WorkerHealthRecord[]> {
    const rows = await this.db.select().from(systemEvents);
    const byWorker = new Map<string, WorkerHealthRecord>();
    for (const row of rows.filter((entry) => entry.eventType === 'worker.health').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
      const health = row.payload as WorkerHealthRecord;
      byWorker.set(health.worker, health);
    }
    return [...byWorker.values()].sort((a, b) => a.worker.localeCompare(b.worker));
  }
}
