import { constants, createPrivateKey, sign } from 'node:crypto';
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
  async fetchPositions(): Promise<Position[]> { throw new Error('Polymarket authenticated position retrieval is not configured.'); }
  async fetchPortfolio(): Promise<PortfolioState> { throw new Error(`Polymarket portfolio retrieval is not configured for tenant ${this.tenantId}.`); }
  async fetchOrder(_orderId: string): Promise<VenueOrderResult | null> { throw new Error('Polymarket authenticated order retrieval is not configured.'); }
}

export class KalshiConnector implements VenueConnector {
  id = 'kalshi' as const;
  constructor(private readonly apiUrl: string, private readonly keyId: string | undefined, private readonly privateKey: string | undefined, private readonly tenantId: string) {}

  private authHeaders(method: string, url: string): HeadersInit {
    if (!this.keyId || !this.privateKey) throw new Error('Kalshi credentials are required for authenticated operations.');
    const timestamp = String(Date.now());
    const path = new URL(url).pathname;
    const signature = signKalshiRequest(this.privateKey, timestamp, method, path);
    return {
      'KALSHI-ACCESS-KEY': this.keyId,
      'KALSHI-ACCESS-TIMESTAMP': timestamp,
      'KALSHI-ACCESS-SIGNATURE': signature
    };
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
    const url = `${this.apiUrl}/portfolio/orders`;
    return getJson<VenueOrderResult>(url, { method: 'POST', headers: { 'content-type': 'application/json', ...this.authHeaders('POST', url) }, body: JSON.stringify(order) });
  }
  async cancelOrder(orderId: string): Promise<VenueCancelResult> {
    const url = `${this.apiUrl}/portfolio/orders/${encodeURIComponent(orderId)}`;
    return getJson<VenueCancelResult>(url, { method: 'DELETE', headers: this.authHeaders('DELETE', url) });
  }
  async fetchPositions(): Promise<Position[]> {
    const url = `${this.apiUrl}/portfolio/positions`;
    return getJson<Position[]>(url, { headers: this.authHeaders('GET', url) });
  }
  async fetchPortfolio(): Promise<PortfolioState> {
    const balanceUrl = `${this.apiUrl}/portfolio/balance`;
    const balance = await getJson<{ balance?: number; portfolio_value?: number; cash?: number }>(balanceUrl, { headers: this.authHeaders('GET', balanceUrl) });
    const positions = await this.fetchPositions();
    const cash = Number(balance.cash ?? balance.balance ?? 0) / (Number(balance.cash ?? balance.balance ?? 0) > 1_000 ? 100 : 1);
    const equity = Number(balance.portfolio_value ?? cash);
    const categoryExposure = positions.reduce<Record<string, number>>((acc, position) => {
      acc[position.category] = (acc[position.category] ?? 0) + position.marketValue;
      return acc;
    }, {});
    return {
      tenantId: this.tenantId,
      cash,
      equity,
      totalExposure: positions.reduce((sum, position) => sum + position.marketValue, 0),
      categoryExposure,
      positions,
      openOrderCount: 0,
      dailyPnl: 0,
      maxDrawdown: 0,
      severeMismatchOpen: false,
      reconciledAt: new Date()
    };
  }
  async fetchOrder(orderId: string): Promise<VenueOrderResult | null> {
    const url = `${this.apiUrl}/portfolio/orders/${encodeURIComponent(orderId)}`;
    return getJson<VenueOrderResult | null>(url, { headers: this.authHeaders('GET', url) });
  }
}

export function signKalshiRequest(privateKeyPem: string, timestamp: string, method: string, path: string): string {
  try {
    const privateKey = createPrivateKey(privateKeyPem.replace(/\\n/g, '\n'));
    return sign('sha256', Buffer.from(`${timestamp}${method.toUpperCase()}${path.split('?')[0]}`), {
      key: privateKey,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST
    }).toString('base64');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Kalshi private key could not sign request: ${detail}`);
  }
}
