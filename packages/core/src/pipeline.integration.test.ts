import { describe, expect, it } from 'vitest';
import type { MarketDossier, NormalizedMarket, OrderbookSnapshot, PortfolioState, VenueConnector, VenueOrderResult } from './index';
import { decisionAudits, orders, systemEvents } from '../../db/src/schema';
import { evaluateMarketPipeline } from '../../../workers/scanner-worker/src/pipeline';
import { processApprovedAudit } from '../../../workers/execution-worker/src/processor';
import { reconcile, reconciliationAuditStatus } from '../../reconciliation/src/index';
import { DecisionAuditRepository, PortfolioRepository, ReconciliationIncidentRepository } from '../../db/src/repositories';
import { KalshiConnector } from '../../venues/src/index';

describe('authoritative trading pipeline', () => {
  it('creates audit and executes approved paper trades', async () => {
    const db = new MemoryDb();
    const market = marketFixture();
    const portfolio = portfolioFixture();
    const audit = await evaluateMarketPipeline(db as never, market, pipelineConfig(portfolio));

    expect(audit.finalOutcome).toBe('trade');
    expect(audit.featureSnapshot?.marketId).toBe(market.id);
    expect(audit.dossierId).toContain(market.id);
    expect(audit.riskDecision?.approved).toBe(true);

    const execution = await processApprovedAudit(db as never, audit, { tenantId: 'tenant', mode: 'paper', connector: new FakeConnector(portfolio), maxDepthParticipation: 1 });
    expect(execution.state).toBe('FILLED');
    expect(execution.filledQuantity).toBeGreaterThan(0);
    expect(execution.averagePrice).toBe(0.44);
    expect((db.table(decisionAudits)[0].payload as typeof audit).executionResult).toBeUndefined();
    expect(db.table(systemEvents)).toHaveLength(1);
    expect((await new DecisionAuditRepository(db as never).getAuditWithEvents(audit.id))?.executionResult?.state).toBe('FILLED');
  });

  it('creates audit for rejected trades without execution eligibility', async () => {
    const db = new MemoryDb();
    const portfolio = { ...portfolioFixture(), severeMismatchOpen: true };
    const audit = await evaluateMarketPipeline(db as never, marketFixture(), pipelineConfig(portfolio));

    expect(audit.finalOutcome).toBe('skip');
    expect(audit.riskDecision?.blockedBy).toBe('reconciliationGate');
    expect(await new DecisionAuditRepository(db as never).approvedPendingExecution('tenant')).toHaveLength(0);
    expect(db.table(decisionAudits)).toHaveLength(1);
  });

  it('blocks approvals when durable kill switch state is active', async () => {
    const db = new MemoryDb();
    const audit = await evaluateMarketPipeline(db as never, marketFixture(), {
      ...pipelineConfig(portfolioFixture()),
      killSwitchActive: true
    });

    expect(audit.finalOutcome).toBe('skip');
    expect(audit.riskDecision?.blockedBy).toBe('killSwitchGate');
  });

  it('blocks live decisions without durable live authorization', async () => {
    const db = new MemoryDb();
    const audit = await evaluateMarketPipeline(db as never, marketFixture(), {
      ...pipelineConfig(portfolioFixture()),
      mode: 'live',
      liveAuthorized: false,
      liveActivationConfirmedAt: undefined
    });

    expect(audit.finalOutcome).toBe('skip');
    expect(audit.riskDecision?.blockedBy).toBe('modeAuthorizationGate');
  });

  it('persists reconciliation severe mismatch state and blocks risk on next audit', async () => {
    const db = new MemoryDb();
    const local = portfolioFixture();
    await new PortfolioRepository(db as never).put(local);
    const report = await reconcile(new FakeConnector({ ...local, cash: 100, equity: 100 }), local, 'tenant');
    const state = await new ReconciliationIncidentRepository(db as never).persistReport('tenant', report);
    await new PortfolioRepository(db as never).markSevereMismatch('tenant', state.severeMismatchOpen);

    expect(reconciliationAuditStatus(report).blockNewOrders).toBe(true);
    const latest = await new PortfolioRepository(db as never).latest('tenant');
    const audit = await evaluateMarketPipeline(db as never, marketFixture(), pipelineConfig(latest as PortfolioState));
    expect(audit.riskDecision?.blockedBy).toBe('reconciliationGate');
    expect(audit.finalOutcome).toBe('skip');
  });

  it('keeps reconciliation clear when local and venue state match', async () => {
    const db = new MemoryDb();
    const local = portfolioFixture();
    const report = await reconcile(new FakeConnector(local), local, 'tenant');
    const state = await new ReconciliationIncidentRepository(db as never).persistReport('tenant', report);

    expect(report.severe).toBe(false);
    expect(report.blockNewOrders).toBe(false);
    expect(state.severeMismatchOpen).toBe(false);
  });

  it('acknowledges severe mismatches without clearing the trading block, then clears it explicitly', async () => {
    const db = new MemoryDb();
    const portfolioRepository = new PortfolioRepository(db as never);
    const incidentRepository = new ReconciliationIncidentRepository(db as never);
    const local = portfolioFixture();
    const report = await reconcile(new FakeConnector({ ...local, cash: 100, equity: 100 }), local, 'tenant');

    await incidentRepository.persistReport('tenant', report);
    const acknowledged = await incidentRepository.acknowledge({ tenantId: 'tenant', actorId: 'operator-1', reason: 'investigating venue drift' });
    await portfolioRepository.markSevereMismatch('tenant', acknowledged.severeMismatchOpen);
    const blockedPortfolio = await portfolioRepository.latest('tenant');
    const blockedAudit = await evaluateMarketPipeline(db as never, marketFixture(), pipelineConfig(blockedPortfolio as PortfolioState));

    expect(acknowledged.acknowledged).toBe(true);
    expect(blockedAudit.riskDecision?.blockedBy).toBe('reconciliationGate');

    const cleared = await incidentRepository.clear('tenant', 'local and venue positions remediated', 'operator-1');
    await portfolioRepository.markSevereMismatch('tenant', cleared.severeMismatchOpen);
    const clearedPortfolio = await portfolioRepository.latest('tenant');
    const clearedAudit = await evaluateMarketPipeline(db as never, marketFixture(), pipelineConfig(clearedPortfolio as PortfolioState));

    expect(cleared.severeMismatchOpen).toBe(false);
    expect(clearedAudit.riskDecision?.blockedBy).not.toBe('reconciliationGate');
  });

  it('writes reconciliation status as an append-only audit event', async () => {
    const db = new MemoryDb();
    const local = portfolioFixture();
    const audit = await evaluateMarketPipeline(db as never, marketFixture(), pipelineConfig(local));
    const report = await reconcile(new FakeConnector({ ...local, cash: 100, equity: 100 }), local, 'tenant');
    const status = reconciliationAuditStatus(report);

    await new DecisionAuditRepository(db as never).markReconciliationStatus(audit.id, status);

    expect((db.table(decisionAudits)[0].payload as typeof audit).reconciliationStatus).toBeUndefined();
    expect(db.table(systemEvents)).toHaveLength(1);
    expect((await new DecisionAuditRepository(db as never).getAuditWithEvents(audit.id))?.reconciliationStatus?.blockNewOrders).toBe(true);
  });

  it('rejects paper execution safely when the captured orderbook is missing', async () => {
    const db = new MemoryDb();
    const audit = await evaluateMarketPipeline(db as never, marketFixture(), {
      ...pipelineConfig(portfolioFixture()),
      capturedOrderbook: undefined
    });

    const execution = await processApprovedAudit(db as never, audit, { tenantId: 'tenant', mode: 'paper', connector: new FakeConnector(portfolioFixture()), maxDepthParticipation: 1 });

    expect(execution.state).toBe('REJECTED');
    expect(execution.error).toBe('captured orderbook snapshot is required for paper execution');
    expect((db.table(decisionAudits)[0].payload as typeof audit).executionResult).toBeUndefined();
    expect(db.table(systemEvents)).toHaveLength(1);
    expect((db.table(systemEvents)[0].payload as { payload: typeof execution }).payload.state).toBe('REJECTED');
  });

  it('does not create duplicate orders or execution events when an approved audit is processed twice', async () => {
    const db = new MemoryDb();
    const portfolio = portfolioFixture();
    const audit = await evaluateMarketPipeline(db as never, marketFixture(), pipelineConfig(portfolio));

    const first = await processApprovedAudit(db as never, audit, { tenantId: 'tenant', mode: 'paper', connector: new FakeConnector(portfolio), maxDepthParticipation: 1 });
    const second = await processApprovedAudit(db as never, audit, { tenantId: 'tenant', mode: 'paper', connector: new FakeConnector(portfolio), maxDepthParticipation: 1 });

    expect(second).toEqual(first);
    expect(db.table(orders)).toHaveLength(1);
    expect(db.table(systemEvents)).toHaveLength(1);
    expect((db.table(decisionAudits)[0].payload as typeof audit).executionResult).toBeUndefined();
  });

  it('does not submit duplicate venue orders when a live Kalshi audit is processed twice', async () => {
    const db = new MemoryDb();
    const portfolio = portfolioFixture();
    const connector = new CountingLiveConnector();
    const audit = await evaluateMarketPipeline(db as never, marketFixture(), pipelineConfig(portfolio));

    const first = await processApprovedAudit(db as never, audit, { tenantId: 'tenant', mode: 'live', connector });
    const second = await processApprovedAudit(db as never, audit, { tenantId: 'tenant', mode: 'live', connector });

    expect(first.state).toBe('ACCEPTED_BY_CLOB');
    expect(first.status).toBe('submitted');
    expect(second).toEqual(first);
    expect(connector.placeOrderCount).toBe(1);
    expect(db.table(orders)).toHaveLength(1);
    expect(db.table(systemEvents)).toHaveLength(1);
    expect((db.table(decisionAudits)[0].payload as typeof audit).executionResult).toBeUndefined();
  });

  it('records missing Kalshi live credentials as a safe failed execution event', async () => {
    const db = new MemoryDb();
    const audit = await evaluateMarketPipeline(db as never, marketFixture(), pipelineConfig(portfolioFixture()));

    const execution = await processApprovedAudit(db as never, audit, {
      tenantId: 'tenant',
      mode: 'live',
      connector: new KalshiConnector('https://kalshi.invalid', undefined, undefined, 'tenant')
    });

    expect(execution.state).toBe('REJECTED');
    expect(execution.status).toBe('failed');
    expect(execution.error).toBe('Kalshi credentials are required for authenticated operations.');
    expect(db.table(systemEvents)).toHaveLength(1);
    expect((db.table(systemEvents)[0].payload as { payload: typeof execution }).payload.status).toBe('failed');
    expect((db.table(decisionAudits)[0].payload as typeof audit).executionResult).toBeUndefined();
  });

  it('records retryable Kalshi venue errors as auditable retryable execution events', async () => {
    const db = new MemoryDb();
    const audit = await evaluateMarketPipeline(db as never, marketFixture(), pipelineConfig(portfolioFixture()));

    const execution = await processApprovedAudit(db as never, audit, {
      tenantId: 'tenant',
      mode: 'live',
      connector: new ThrowingLiveConnector('HTTP 500 Internal Server Error from Kalshi')
    });

    expect(execution.state).toBe('REJECTED');
    expect(execution.status).toBe('retryable');
    expect(db.table(systemEvents)).toHaveLength(1);
    expect((db.table(systemEvents)[0].payload as { payload: typeof execution }).payload.status).toBe('retryable');
    expect((db.table(decisionAudits)[0].payload as typeof audit).executionResult).toBeUndefined();
  });

  it('submits Polymarket live execution through the configured venue connector', async () => {
    const db = new MemoryDb();
    const audit = await evaluateMarketPipeline(db as never, { ...marketFixture(), source: 'polymarket' }, pipelineConfig(portfolioFixture()));
    const connector = new CountingLiveConnector('polymarket');

    const execution = await processApprovedAudit(db as never, audit, { tenantId: 'tenant', mode: 'live', connector });

    expect(execution.state).toBe('ACCEPTED_BY_CLOB');
    expect(execution.status).toBe('submitted');
    expect(connector.placeOrderCount).toBe(1);
    expect(db.table(systemEvents)).toHaveLength(1);
    expect((db.table(decisionAudits)[0].payload as typeof audit).executionResult).toBeUndefined();
  });
});

function pipelineConfig(portfolio: PortfolioState) {
  return {
    tenantId: 'tenant',
    mode: 'paper' as const,
    mandateId: 'aggressive' as const,
    portfolio,
    liveAuthorized: false,
    killSwitchActive: false,
    dailyLossLimit: 500,
    drawdownLimit: 0.1,
    maxOpenOrders: 10,
    maxParticipationRate: 0.2,
    severeAnomaly: false,
    capturedOrderbook: capturedBook(),
    researchStages: approvedResearchStages()
  };
}

function capturedBook(): OrderbookSnapshot {
  return {
    marketId: 'market-1',
    source: 'kalshi',
    bids: [{ price: 0.43, size: 1000 }],
    asks: [{ price: 0.44, size: 1000 }],
    capturedAt: new Date()
  };
}

function approvedResearchStages() {
  const strong = {
    baseRate: 0.58,
    probabilityEstimate: 0.58,
    probabilityLow: 0.56,
    probabilityHigh: 0.6,
    confidence: 0.9,
    evidenceStrength: 0.9,
    sentimentSignal: 0.5
  };
  return {
    resolution_parser: async (market: NormalizedMarket): Promise<Partial<MarketDossier>> => ({ resolutionClarified: market.resolutionCriteria, resolutionAmbiguityScore: 0 }),
    web_research: async (market: NormalizedMarket): Promise<Partial<MarketDossier>> => ({ currentFacts: [{ claim: market.question, source: 'test', capturedAt: new Date() }], sourceCount: 2, sourceQuality: 0.8, informationAge: 100 }),
    base_rate_calculator: async (): Promise<Partial<MarketDossier>> => ({ baseRate: strong.baseRate }),
    sentiment_analyzer: async (): Promise<Partial<MarketDossier>> => ({ sentimentSignal: strong.sentimentSignal }),
    microstructure_analyzer: async (): Promise<Partial<MarketDossier>> => ({ microstructureSignal: 0 }),
    catalyst_forecaster: async (): Promise<Partial<MarketDossier>> => ({ catalysts: ['test'], keyDrivers: ['test'] }),
    memory_matcher: async (): Promise<Partial<MarketDossier>> => ({ marketMemoryMatches: [{ marketId: 'prior', question: 'prior', resolutionCriteria: 'clear', similarity: 0.8 }] }),
    deep_reasoner: async (): Promise<Partial<MarketDossier>> => ({ ...strong, contraryCase: 'contrary', steelmanRebuttal: 'rebuttal', identifiedBlindSpots: [] })
  };
}

function marketFixture(): NormalizedMarket {
  return {
    id: 'market-1',
    source: 'kalshi',
    externalId: 'MKT',
    slug: 'mkt',
    question: 'Will the event happen?',
    resolutionCriteria: 'Official result resolves this market.',
    resolutionDate: new Date(Date.now() + 7 * 86_400_000),
    status: 'active',
    bestBid: 0.43,
    bestAsk: 0.45,
    spread: 0.02,
    spreadBps: 455,
    midpoint: 0.44,
    lastTradePrice: 0.44,
    bidDepth1Pct: 1000,
    askDepth1Pct: 1000,
    bidDepth5Pct: 3000,
    askDepth5Pct: 3000,
    totalLiquidity: 20_000,
    volume24h: 5_000,
    volume7d: 20_000,
    openInterest: 5_000,
    tradeCount24h: 100,
    dataFreshnessMs: 500,
    isLiquid: true,
    hasAmbiguousResolution: false,
    resolutionAmbiguityScore: 0,
    category: 'macro',
    tags: ['test'],
    scannedAt: new Date()
  };
}

function portfolioFixture(): PortfolioState {
  return {
    tenantId: 'tenant',
    cash: 10_000,
    equity: 10_000,
    totalExposure: 100,
    categoryExposure: { macro: 100 },
    positions: [],
    openOrderCount: 0,
    dailyPnl: 0,
    maxDrawdown: 0,
    severeMismatchOpen: false,
    reconciledAt: new Date()
  };
}

class FakeConnector implements VenueConnector {
  id: 'kalshi' | 'polymarket' = 'kalshi';
  constructor(private readonly portfolio: PortfolioState) {}
  async fetchMarkets() { return [marketFixture()]; }
  async fetchOrderbook() { return { marketId: 'market-1', source: this.id, bids: [{ price: 0.49, size: 1000 }], asks: [{ price: 0.51, size: 1000 }], capturedAt: new Date() }; }
  async placeOrder(): Promise<VenueOrderResult> { return { venueOrderId: 'venue-1', clientOrderId: 'client', state: 'ACCEPTED_BY_CLOB', filledQuantity: 0 }; }
  async cancelOrder() { return { venueOrderId: 'venue-1', confirmed: true }; }
  async fetchPositions() { return this.portfolio.positions; }
  async fetchPortfolio() { return this.portfolio; }
  async fetchOrder(): Promise<VenueOrderResult | null> { return { venueOrderId: 'venue-1', clientOrderId: 'client', state: 'FILLED', filledQuantity: 1 }; }
}

class CountingLiveConnector extends FakeConnector {
  id: 'kalshi' | 'polymarket';
  placeOrderCount = 0;

  constructor(id: 'kalshi' | 'polymarket' = 'kalshi') {
    super(portfolioFixture());
    this.id = id;
  }

  async placeOrder(): Promise<VenueOrderResult> {
    this.placeOrderCount += 1;
    return { venueOrderId: `venue-${this.placeOrderCount}`, clientOrderId: 'client', state: 'ACCEPTED_BY_CLOB', filledQuantity: 0 };
  }
}

class ThrowingLiveConnector extends FakeConnector {
  constructor(private readonly message: string) {
    super(portfolioFixture());
  }

  async placeOrder(): Promise<VenueOrderResult> {
    throw new Error(this.message);
  }
}

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

  update(table: unknown) {
    return {
      set: (value: any) => ({
        where: async () => {
          const rows = this.table(table);
          Object.assign(rows[0] ?? {}, value);
        }
      })
    };
  }
}

class MemoryQuery {
  constructor(private readonly rows: any[]) {}
  where() { return this; }
  orderBy() { return this; }
  limit(count: number) { return Promise.resolve(this.rows.slice(-count).reverse()); }
  then(resolve: (rows: any[]) => void) { return Promise.resolve(this.rows).then(resolve); }
}
