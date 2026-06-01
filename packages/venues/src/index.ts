import type { NewOrder, NormalizedMarket, OrderbookSnapshot, PortfolioState, Position, VenueCancelResult, VenueConnector, VenueOrderResult } from '@polyshore/core';

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText} from ${url}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function emptyPortfolio(tenantId: string): PortfolioState {
  return { tenantId, cash: 0, equity: 0, totalExposure: 0, categoryExposure: {}, positions: [], openOrderCount: 0, dailyPnl: 0, maxDrawdown: 0, severeMismatchOpen: false };
}

export class PolymarketConnector implements VenueConnector {
  id = 'polymarket' as const;
  constructor(private readonly gammaUrl: string, private readonly clobUrl: string, private readonly tenantId: string) {}

  async fetchMarkets(): Promise<NormalizedMarket[]> {
    const rows = await getJson<Array<Record<string, unknown>>>(`${this.gammaUrl}/markets?active=true&closed=false`);
    return rows.map((row) => {
      const bestBid = Number(row.bestBid ?? row.best_bid ?? 0);
      const bestAsk = Number(row.bestAsk ?? row.best_ask ?? 0);
      const midpoint = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;
      return {
        id: `polymarket:${String(row.id ?? row.conditionId ?? row.slug)}`,
        source: 'polymarket',
        externalId: String(row.id ?? row.conditionId ?? ''),
        slug: String(row.slug ?? ''),
        question: String(row.question ?? row.title ?? ''),
        resolutionCriteria: String(row.resolutionSource ?? row.rules ?? ''),
        resolutionDate: new Date(String(row.endDate ?? row.end_date ?? Date.now())),
        status: 'active',
        bestBid,
        bestAsk,
        spread: Math.max(0, bestAsk - bestBid),
        spreadBps: midpoint > 0 ? ((bestAsk - bestBid) / midpoint) * 10_000 : 0,
        midpoint,
        lastTradePrice: Number(row.lastTradePrice ?? row.last_trade_price ?? midpoint),
        bidDepth1Pct: 0,
        askDepth1Pct: 0,
        bidDepth5Pct: 0,
        askDepth5Pct: 0,
        totalLiquidity: Number(row.liquidityNum ?? row.liquidity ?? 0),
        volume24h: Number(row.volume24hr ?? row.volume24h ?? 0),
        volume7d: Number(row.volume1wk ?? row.volume7d ?? 0),
        openInterest: Number(row.openInterest ?? 0),
        tradeCount24h: Number(row.tradeCount24h ?? 0),
        dataFreshnessMs: 0,
        isLiquid: Number(row.liquidityNum ?? row.liquidity ?? 0) >= 500,
        hasAmbiguousResolution: false,
        resolutionAmbiguityScore: 0,
        category: String(row.category ?? 'uncategorized'),
        tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
        scannedAt: new Date()
      };
    });
  }

  async fetchOrderbook(marketId: string): Promise<OrderbookSnapshot> {
    const tokenId = encodeURIComponent(marketId.replace(/^polymarket:/, ''));
    const book = await getJson<{ bids?: { price: string; size: string }[]; asks?: { price: string; size: string }[] }>(`${this.clobUrl}/book?token_id=${tokenId}`);
    return {
      marketId,
      source: this.id,
      bids: (book.bids ?? []).map((b) => ({ price: Number(b.price), size: Number(b.size) })),
      asks: (book.asks ?? []).map((a) => ({ price: Number(a.price), size: Number(a.size) })),
      capturedAt: new Date()
    };
  }

  async placeOrder(_order: NewOrder): Promise<VenueOrderResult> {
    throw new Error('Polymarket live order signing is not configured. Enable a signing adapter before live mode.');
  }
  async cancelOrder(_orderId: string): Promise<VenueCancelResult> { throw new Error('Polymarket cancel requires live order credentials.'); }
  async fetchPositions(): Promise<Position[]> { return []; }
  async fetchPortfolio(): Promise<PortfolioState> { return emptyPortfolio(this.tenantId); }
  async fetchOrder(_orderId: string): Promise<VenueOrderResult | null> { return null; }
}

export class KalshiConnector implements VenueConnector {
  id = 'kalshi' as const;
  constructor(private readonly apiUrl: string, private readonly keyId: string | undefined, private readonly privateKey: string | undefined, private readonly tenantId: string) {}

  private authHeaders(): HeadersInit {
    if (!this.keyId || !this.privateKey) throw new Error('Kalshi credentials are required for authenticated operations.');
    return { 'KALSHI-ACCESS-KEY': this.keyId };
  }

  async fetchMarkets(): Promise<NormalizedMarket[]> {
    const payload = await getJson<{ markets: Array<Record<string, unknown>> }>(`${this.apiUrl}/markets?status=open`);
    return payload.markets.map((row) => {
      const yesBid = Number(row.yes_bid ?? 0) / 100;
      const yesAsk = Number(row.yes_ask ?? 0) / 100;
      const midpoint = yesBid > 0 && yesAsk > 0 ? (yesBid + yesAsk) / 2 : 0;
      return {
        id: `kalshi:${String(row.ticker)}`,
        source: 'kalshi',
        externalId: String(row.ticker),
        slug: String(row.ticker),
        question: String(row.title ?? row.subtitle ?? ''),
        resolutionCriteria: String(row.rules_primary ?? row.settlement_sources ?? ''),
        resolutionDate: new Date(String(row.close_time ?? row.expiration_time ?? Date.now())),
        status: 'active',
        bestBid: yesBid,
        bestAsk: yesAsk,
        spread: Math.max(0, yesAsk - yesBid),
        spreadBps: midpoint > 0 ? ((yesAsk - yesBid) / midpoint) * 10_000 : 0,
        midpoint,
        lastTradePrice: Number(row.last_price ?? 0) / 100,
        bidDepth1Pct: 0,
        askDepth1Pct: 0,
        bidDepth5Pct: 0,
        askDepth5Pct: 0,
        totalLiquidity: Number(row.liquidity ?? 0),
        volume24h: Number(row.volume_24h ?? 0),
        volume7d: Number(row.volume ?? 0),
        openInterest: Number(row.open_interest ?? 0),
        tradeCount24h: Number(row.trades_24h ?? 0),
        dataFreshnessMs: 0,
        isLiquid: Number(row.liquidity ?? 0) >= 500,
        hasAmbiguousResolution: false,
        resolutionAmbiguityScore: 0,
        category: String(row.category ?? 'uncategorized'),
        tags: [],
        scannedAt: new Date()
      };
    });
  }

  async fetchOrderbook(marketId: string): Promise<OrderbookSnapshot> {
    const ticker = encodeURIComponent(marketId.replace(/^kalshi:/, ''));
    const payload = await getJson<{ orderbook: { yes?: [number, number][]; no?: [number, number][] } }>(`${this.apiUrl}/markets/${ticker}/orderbook`);
    return {
      marketId,
      source: this.id,
      bids: (payload.orderbook.yes ?? []).map(([price, size]) => ({ price: price / 100, size })),
      asks: (payload.orderbook.no ?? []).map(([price, size]) => ({ price: 1 - price / 100, size })),
      capturedAt: new Date()
    };
  }

  async placeOrder(order: NewOrder): Promise<VenueOrderResult> {
    return getJson<VenueOrderResult>(`${this.apiUrl}/portfolio/orders`, { method: 'POST', headers: { 'content-type': 'application/json', ...this.authHeaders() }, body: JSON.stringify(order) });
  }
  async cancelOrder(orderId: string): Promise<VenueCancelResult> {
    return getJson<VenueCancelResult>(`${this.apiUrl}/portfolio/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE', headers: this.authHeaders() });
  }
  async fetchPositions(): Promise<Position[]> { return getJson<Position[]>(`${this.apiUrl}/portfolio/positions`, { headers: this.authHeaders() }); }
  async fetchPortfolio(): Promise<PortfolioState> { return emptyPortfolio(this.tenantId); }
  async fetchOrder(orderId: string): Promise<VenueOrderResult | null> { return getJson<VenueOrderResult | null>(`${this.apiUrl}/portfolio/orders/${encodeURIComponent(orderId)}`, { headers: this.authHeaders() }); }
}
