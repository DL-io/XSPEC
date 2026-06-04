import type { DecisionAudit, ExecutionAuditResult, NewOrder, OperatingMode, OrderbookSnapshot, VenueConnector } from '@polyshore/core';
import type { LiveOrderStore } from '@polyshore/execution';
import { DecisionAuditRepository, OrderRepository, type OmegaDb } from '../../../packages/db/src/index.ts';
import { classifyVenueExecutionError, executePaperOrder, submitLiveLimitOrder } from '../../../packages/execution/src/index.ts';

export interface ExecutionProcessorConfig {
  tenantId: string;
  mode: OperatingMode;
  connector: VenueConnector;
  paperLatencyMs?: number;
  maxDepthParticipation?: number;
  rejectionThreshold?: number;
}

export async function processApprovedAudit(db: OmegaDb, audit: DecisionAudit, config: ExecutionProcessorConfig): Promise<ExecutionAuditResult> {
  const auditStore = new DecisionAuditRepository(db);
  const hydratedAudit = await auditStore.getAuditWithEvents(audit.id) ?? audit;
  if (hydratedAudit.executionResult) return hydratedAudit.executionResult;
  if (hydratedAudit.finalOutcome !== 'trade' || !hydratedAudit.riskDecision?.approved || !hydratedAudit.tradeProposal) {
    throw new Error(`Audit ${audit.id} is not an approved trade intent`);
  }
  const order: NewOrder = {
    marketId: hydratedAudit.marketId,
    side: hydratedAudit.tradeProposal.side,
    quantity: hydratedAudit.riskDecision.maxApprovedSize,
    limitPrice: hydratedAudit.tradeProposal.limitPrice,
    clientOrderId: hydratedAudit.id
  };
  const orderStore = new OrderRepository(db, config.tenantId);
  const localOrderId = await orderStore.createIntent(order, orderIntentId(hydratedAudit));
  await orderStore.recordTransition(localOrderId, 'ORDER_VALIDATED', 'approved audit converted to order intent');
  if (config.mode === 'live' && config.connector.id === 'polymarket') {
    return rejectLiveOrder({
      auditStore,
      orderStore,
      auditId: hydratedAudit.id,
      orderId: localOrderId,
      status: 'unsupported',
      reason: 'Polymarket authenticated live execution is unsupported until a signing adapter is configured.'
    });
  }
  try {
    const result = config.mode === 'paper'
      ? await executePaperOrder(order, capturedBookOrThrow(hydratedAudit), {
          latencyMs: config.paperLatencyMs ?? 0,
          maxDepthParticipation: config.maxDepthParticipation ?? 0.1,
          rejectionThreshold: config.rejectionThreshold ?? 0.01
        })
      : { result: await submitLiveLimitOrder(config.connector, order, existingOrderStore(orderStore, localOrderId)), realizedCost: undefined };
    const executionResult: ExecutionAuditResult = {
      venueOrderId: result.result.venueOrderId,
      state: result.result.state,
      status: result.result.state === 'REJECTED' ? 'rejected' : 'submitted',
      filledQuantity: result.result.filledQuantity,
      averagePrice: result.result.averagePrice,
      realizedCost: result.realizedCost,
      processedAt: new Date()
    };
    await orderStore.recordTransition(localOrderId, result.result.state, 'execution result persisted', result.result.venueOrderId);
    await auditStore.markExecutionResult(hydratedAudit.id, executionResult);
    return executionResult;
  } catch (error) {
    const status = config.mode === 'live' ? classifyVenueExecutionError(error) : 'rejected';
    const executionResult: ExecutionAuditResult = {
      venueOrderId: `failed:${hydratedAudit.id}`,
      state: 'REJECTED',
      status,
      filledQuantity: 0,
      processedAt: new Date(),
      error: error instanceof Error ? error.message : String(error)
    };
    await orderStore.recordTransition(localOrderId, 'REJECTED', executionResult.error ?? 'execution failed');
    await auditStore.markExecutionResult(hydratedAudit.id, executionResult);
    return executionResult;
  }
}

export async function processPendingApprovedAudits(db: OmegaDb, config: ExecutionProcessorConfig, limit = 25): Promise<ExecutionAuditResult[]> {
  const repository = new DecisionAuditRepository(db);
  const audits = await repository.approvedPendingExecution(config.tenantId, limit);
  const results: ExecutionAuditResult[] = [];
  for (const audit of audits) {
    results.push(await processApprovedAudit(db, audit, config));
  }
  return results;
}

function orderIntentId(audit: Pick<DecisionAudit, 'id'>): string {
  return `audit:${audit.id}:order-intent`;
}

function capturedBookOrThrow(audit: DecisionAudit): OrderbookSnapshot {
  const book = audit.capturedOrderbook;
  if (!book) throw new Error('captured orderbook snapshot is required for paper execution');
  if (book.marketId !== audit.marketId) throw new Error('captured orderbook market does not match approved audit');
  if (!Array.isArray(book.bids) || !Array.isArray(book.asks)) throw new Error('captured orderbook snapshot is malformed');
  return book;
}

function existingOrderStore(store: OrderRepository, orderId: string): LiveOrderStore {
  return {
    createIntent: async () => orderId,
    recordTransition: (id, to, reason, venueOrderId) => store.recordTransition(id, to, reason, venueOrderId),
    persistVenueOrderId: (id, venueOrderId) => store.persistVenueOrderId(id, venueOrderId)
  };
}

async function rejectLiveOrder(input: {
  auditStore: DecisionAuditRepository;
  orderStore: OrderRepository;
  auditId: string;
  orderId: string;
  status: ExecutionAuditResult['status'];
  reason: string;
}): Promise<ExecutionAuditResult> {
  const executionResult: ExecutionAuditResult = {
    venueOrderId: `failed:${input.auditId}`,
    state: 'REJECTED',
    status: input.status,
    filledQuantity: 0,
    processedAt: new Date(),
    error: input.reason
  };
  await input.orderStore.recordTransition(input.orderId, 'REJECTED', input.reason);
  await input.auditStore.markExecutionResult(input.auditId, executionResult);
  return executionResult;
}
