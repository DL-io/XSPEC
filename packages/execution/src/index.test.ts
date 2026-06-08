import { describe, expect, it } from 'vitest';
import { executePaperOrder } from './index';

describe('paper execution', () => {
  it('executes against bid/ask depth instead of midpoint', async () => {
    const result = await executePaperOrder(
      { marketId: 'm', side: 'yes', quantity: 10, limitPrice: 0.6, clientOrderId: 'c' },
      { marketId: 'm', source: 'polymarket', bids: [{ price: 0.5, size: 10 }], asks: [{ price: 0.6, size: 10 }], capturedAt: new Date() },
      { latencyMs: 0, maxDepthParticipation: 1, rejectionThreshold: 0.5 }
    );
    expect(result.result.averagePrice).toBe(0.6);
    expect(result.transitions.map((transition) => transition.to)).toEqual(['INTENT_CREATED', 'ORDER_VALIDATED', 'ORDER_SIGNED', 'ORDER_POSTED', 'ACCEPTED_BY_CLOB', 'FILLED']);
  });
});
