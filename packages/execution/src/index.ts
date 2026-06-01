import type { NewOrder, OrderLifecycleState, OrderStateTransition, OrderbookSnapshot, VenueConnector, VenueOrderResult } from '@polyshore/core';

export interface PaperExecutionConfig { latencyMs: number; maxDepthParticipation: number; rejectionThreshold: number; }
export interface ExecutionResult { result: VenueOrderResult; transitions: OrderStateTransition[]; realizedCost: number; }

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

function rejected(order: NewOrder, reason: string): ExecutionResult {
  return { result: { venueOrderId: `paper:${order.clientOrderId}`, clientOrderId: order.clientOrderId, state: 'REJECTED', filledQuantity: 0 }, transitions: transitions(order.clientOrderId, 'REJECTED', reason), realizedCost: 0 };
}

function transitions(orderId: string, finalState: OrderLifecycleState, reason: string): OrderStateTransition[] {
  const now = new Date();
  const states: OrderLifecycleState[] = ['INTENT_CREATED', 'ORDER_VALIDATED', 'ORDER_SIGNED', 'ORDER_POSTED', 'ACCEPTED_BY_VENUE'];
  if (finalState !== 'ACCEPTED_BY_VENUE') states.push(finalState);
  return states.map((to, index) => ({ id: `${orderId}:${index}:${to}`, orderId, from: index === 0 ? undefined : states[index - 1], to, reason, createdAt: now }));
}
