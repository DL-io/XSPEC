import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { AlertEvent, DecisionAudit, MarketDossier, NewOrder, NormalizedMarket, OrderLifecycleState, PortfolioState, ResearchPack } from '@polyshore/core';
import type { LiveOrderStore } from '@polyshore/execution';
import type { OmegaDb } from './client';
import { calibrationRecords, decisionAudits, dossiers, markets, orders, orderStateTransitions, portfolioSnapshots, researchPacks, systemEvents } from './schema';

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

export class DossierRepository {
  constructor(private readonly db: OmegaDb) {}

  async put(dossier: MarketDossier): Promise<void> {
    await this.db.insert(dossiers).values({
      id: `${dossier.marketId}:${dossier.generatedAt.toISOString()}`,
      marketId: dossier.marketId,
      payload: dossier,
      generatedAt: dossier.generatedAt,
      freshnessExpiresAt: dossier.freshnessExpiresAt
    });
  }

  async latest(marketId: string): Promise<MarketDossier | null> {
    const rows = await this.db.select().from(dossiers).where(eq(dossiers.marketId, marketId)).orderBy(desc(dossiers.generatedAt)).limit(1);
    return rows[0]?.payload as MarketDossier | undefined ?? null;
  }
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
    return rows.map((row) => row.payload as DecisionAudit);
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
}

export class OrderRepository implements LiveOrderStore {
  constructor(private readonly db: OmegaDb, private readonly tenantId: string) {}

  async createIntent(order: NewOrder): Promise<string> {
    const orderId = crypto.randomUUID();
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

export class PortfolioRepository {
  constructor(private readonly db: OmegaDb) {}

  async latest(tenantId: string): Promise<PortfolioState | null> {
    const rows = await this.db.select().from(portfolioSnapshots).where(eq(portfolioSnapshots.tenantId, tenantId)).orderBy(desc(portfolioSnapshots.capturedAt)).limit(1);
    return rows[0]?.payload as PortfolioState | undefined ?? null;
  }

  async put(snapshot: PortfolioState): Promise<void> {
    await this.db.insert(portfolioSnapshots).values({
      id: crypto.randomUUID(),
      tenantId: snapshot.tenantId,
      payload: snapshot,
      capturedAt: snapshot.reconciledAt ?? new Date()
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
}
