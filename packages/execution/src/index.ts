import type { ExecutionAuditStatus, NewOrder, OrderLifecycleState, OrderStateTransition, OrderbookSnapshot, VenueConnector, VenueOrderResult } from '@polyshore/core';

export interface PaperExecutionConfig { latencyMs: number; maxDepthParticipation: number; rejectionThreshold: number; }
export interface ExecutionResult { result: VenueOrderResult; transitions: OrderStateTransition[]; realizedCost: number; }
export interface LiveOrderStore {
  createIntent(order: NewOrder, idempotencyKey?: string): Promise<string>;
  recordTransition(orderId: string, to: OrderLifecycleState, reason: string, venueOrderId?: string): Promise<void>;
  persistVenueOrderId(orderId: string, venueOrderId: string): Promise<void>;
}

export async function executePaperOrder(order: NewOrder, book: OrderbookSnapshot, config: PaperExecutionConfig): Promise<ExecutionResult> {
  await new Promise((resolve) => setTimeout(resolve, config.latencyMs));
  const levels = order.side === 'yes' ? book.asks : book.bids;
  if (levels.length === 0) return rejected(order, 'empty orderbook');
  let remaining = order.quantity;
  let filledQuantity = 0;
  let notional = 0;
  for (const level of levels) {
    const executable = order.side === 'yes' ? level.price <= order.limitPrice : level.price >= order.limitPrice;
    if (!executable || remaining <= 0) break;
    const maxAtLevel = level.size * config.maxDepthParticipation;
    const fill = Math.min(remaining, maxAtLevel);
    filledQuantity += fill;
    notional += fill * level.price;
    remaining -= fill;
  }
  if (filledQuantity / order.quantity < config.rejectionThreshold) return rejected(order, 'insufficient executable depth');
  const averagePrice = notional / filledQuantity;
  const state: OrderLifecycleState = filledQuantity === order.quantity ? 'FILLED' : 'PARTIALLY_FILLED';
  return {
    result: { venueOrderId: `paper:${order.clientOrderId}`, clientOrderId: order.clientOrderId, state, filledQuantity, averagePrice },
    transitions: transitions(order.clientOrderId, state, 'paper execution from orderbook'),
    realizedCost: Math.abs(averagePrice - order.limitPrice) * filledQuantity
  };
}

export async function executeLiveLimitOrder(connector: VenueConnector, order: NewOrder): Promise<VenueOrderResult> {
  if (order.limitPrice <= 0 || order.limitPrice >= 1) throw new Error('live execution requires a bounded limit price');
  return connector.placeOrder(order);
}

export function classifyVenueExecutionError(error: unknown): ExecutionAuditStatus {
  const message = error instanceof Error ? error.message : String(error);
  if (/polymarket live order signing is not configured|authenticated execution is unsupported/i.test(message)) return 'unsupported';
  if (/credentials are required|requires live order credentials|not configured for tenant|bounded limit price|limit orders only/i.test(message)) return 'failed';
  if (/HTTP (408|409|425|429|5\d\d)\b|abort|timeout|timed out|ECONNRESET|ECONNREFUSED|EPIPE|network/i.test(message)) return 'retryable';
  if (/HTTP 4\d\d\b|rejected|invalid|insufficient/i.test(message)) return 'rejected';
  return 'failed';
}

export async function submitLiveLimitOrder(connector: VenueConnector, order: NewOrder, store: LiveOrderStore): Promise<VenueOrderResult> {
  if (order.limitPrice <= 0 || order.limitPrice >= 1) throw new Error('live execution requires limit orders only with bounded prices');
  const orderId = await store.createIntent(order);
  await store.recordTransition(orderId, 'ORDER_VALIDATED', 'limit order validated');
  await store.recordTransition(orderId, 'ORDER_SIGNED', 'order delegated to venue signing adapter');
  await store.recordTransition(orderId, 'ORDER_POSTED', 'order posted to venue');
  const result = await connector.placeOrder(order);
  if (!result.venueOrderId) throw new Error('venue accepted response did not include exchange order ID');
  await store.persistVenueOrderId(orderId, result.venueOrderId);
  await store.recordTransition(orderId, result.state === 'REJECTED' ? 'REJECTED' : 'ACCEPTED_BY_VENUE', 'venue response persisted before accepted state', result.venueOrderId);
  return result;
}

export async function cancelWithReconciliationEscalation(connector: VenueConnector, orderId: string): Promise<'CANCEL_CONFIRMED' | 'RECONCILIATION_MISMATCH'> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await connector.cancelOrder(orderId);
    if (result.confirmed) return 'CANCEL_CONFIRMED';
  }
  return 'RECONCILIATION_MISMATCH';
}

function rejected(order: NewOrder, reason: string): ExecutionResult {
  return { result: { venueOrderId: `paper:${order.clientOrderId}`, clientOrderId: order.clientOrderId, state: 'REJECTED', filledQuantity: 0 }, transitions: transitions(order.clientOrderId, 'REJECTED', reason), realizedCost: 0 };
}

function transitions(orderId: string, finalState: OrderLifecycleState, reason: string): OrderStateTransition[] {
  const now = new Date();
  const states: OrderLifecycleState[] = ['INTENT_CREATED', 'ORDER_VALIDATED', 'ORDER_SIGNED', 'ORDER_POSTED', 'ACCEPTED_BY_VENUE'];
  if (finalState !== 'ACCEPTED_BY_VENUE') states.push(finalState);
  return states.map((to, index) => ({ id: `${orderId}:${index}:${to}`, orderId, from: index === 0 ? undefined : states[index - 1], to, reason, createdAt: now }));
}
