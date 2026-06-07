import { constants, createPrivateKey, sign } from 'node:crypto';
import { AssetType, Chain, ClobClient, OrderType, Side as ClobSide, SignatureTypeV2, type ApiKeyCreds, type OpenOrder, type OrderResponse, type Trade } from '@polymarket/clob-client-v2';
import type { NewOrder, NormalizedMarket, OrderbookSnapshot, PortfolioState, Position, VenueCancelResult, VenueConnector, VenueOrderResult } from '@polyshore/core';
import { createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

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
  private readonly outcomeTokenIds = new Map<string, { yes: string; no?: string }>();
  private clobClient?: ClobClient;

  constructor(
    private readonly gammaUrl: string,
    private readonly clobUrl: string,
    private readonly tenantId: string,
    auth?: PolymarketAuthConfig
  ) {
    if (auth?.privateKey) {
      const account = privateKeyToAccount(auth.privateKey as Hex);
      const signer = createWalletClient({ account, transport: http() });
      this.clobClient = new ClobClient({
        host: clobUrl,
        chain: auth.chainId ?? Chain.POLYGON,
        signer,
        creds: auth.creds,
        signatureType: auth.signatureType ?? SignatureTypeV2.POLY_1271,
        funderAddress: auth.funderAddress,
        throwOnError: true
      });
    }
  }

  async fetchMarkets(): Promise<NormalizedMarket[]> {
    const rows = await getJson<Array<Record<string, unknown>>>(`${this.gammaUrl}/markets?active=true&closed=false`);
    return rows.map((row) => {
      const conditionId = String(row.conditionId ?? row.condition_id ?? row.id ?? row.slug ?? '');
      const tokenIds = parsePolymarketTokenIds(row);
      const marketId = `polymarket:${conditionId}`;
      if (tokenIds.yes) this.outcomeTokenIds.set(marketId, tokenIds);
      const bestBid = Number(row.bestBid ?? row.best_bid ?? 0);
      const bestAsk = Number(row.bestAsk ?? row.best_ask ?? 0);
      const midpoint = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;
      return {
        id: marketId,
        source: 'polymarket',
        externalId: conditionId,
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
    const tokenId = encodeURIComponent(this.tokenIdFor(marketId, 'yes'));
    const book = await getJson<{ bids?: { price: string; size: string }[]; asks?: { price: string; size: string }[] }>(`${this.clobUrl}/book?token_id=${tokenId}`);
    return {
      marketId,
      source: this.id,
      bids: (book.bids ?? []).map((b) => ({ price: Number(b.price), size: Number(b.size) })),
      asks: (book.asks ?? []).map((a) => ({ price: Number(a.price), size: Number(a.size) })),
      capturedAt: new Date()
    };
  }

  async placeOrder(order: NewOrder): Promise<VenueOrderResult> {
    const client = await this.authenticatedClient();
    const tokenID = this.tokenIdFor(order.marketId, order.side);
    await assertPolymarketAllowance(client, tokenID, order);
    const response = await client.createAndPostOrder({
      tokenID,
      price: order.limitPrice,
      side: ClobSide.BUY,
      size: order.quantity
    }, { tickSize: '0.01' }, OrderType.GTC) as OrderResponse;
    if (!response.success) throw new Error(response.errorMsg || 'Polymarket order rejected by CLOB');
    return mapPolymarketOrderResponse(response, order.clientOrderId);
  }

  async cancelOrder(orderId: string): Promise<VenueCancelResult> {
    const response = await this.authenticatedClient().then((client) => client.cancelOrder({ orderID: orderId })) as { canceled?: string[]; not_canceled?: Record<string, string>; status?: string };
    const failedReason = response.not_canceled?.[orderId];
    return { venueOrderId: orderId, confirmed: !failedReason && (response.canceled?.includes(orderId) || response.status === 'success'), raw: response };
  }

  async fetchPositions(): Promise<Position[]> {
    const trades = await this.authenticatedClient().then((client) => client.getTrades(undefined, true)) as Trade[];
    const byToken = new Map<string, Position>();
    for (const trade of trades) {
      const size = Number(trade.size);
      const price = Number(trade.price);
      const quantityDelta = trade.side === ClobSide.BUY ? size : -size;
      const existing = byToken.get(trade.asset_id);
      const quantity = (existing?.quantity ?? 0) + quantityDelta;
      if (Math.abs(quantity) < 1e-9) {
        byToken.delete(trade.asset_id);
        continue;
      }
      const marketId = `polymarket:${trade.market}`;
      const marketValue = quantity * price;
      const averagePrice = existing
        ? ((existing.averagePrice * Math.abs(existing.quantity)) + (price * Math.abs(quantityDelta))) / (Math.abs(existing.quantity) + Math.abs(quantityDelta))
        : price;
      byToken.set(trade.asset_id, {
        id: `polymarket:${trade.asset_id}`,
        marketId,
        side: trade.outcome?.toLowerCase() === 'no' ? 'no' : 'yes',
        quantity,
        averagePrice,
        marketValue,
        category: 'uncategorized',
        venue: this.id
      });
    }
    return [...byToken.values()];
  }

  async fetchPortfolio(): Promise<PortfolioState> {
    const client = await this.authenticatedClient();
    const [positions, collateral] = await Promise.all([
      this.fetchPositions(),
      client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL })
    ]);
    const cash = normalizeUsdcAmount(Number(collateral.balance));
    const totalExposure = positions.reduce((sum, position) => sum + position.marketValue, 0);
    const categoryExposure = positions.reduce<Record<string, number>>((acc, position) => {
      acc[position.category] = (acc[position.category] ?? 0) + position.marketValue;
      return acc;
    }, {});
    return {
      tenantId: this.tenantId,
      cash,
      equity: cash + totalExposure,
      totalExposure,
      categoryExposure,
      positions,
      openOrderCount: (await client.getOpenOrders(undefined, true)).length,
      dailyPnl: 0,
      maxDrawdown: 0,
      severeMismatchOpen: false,
      reconciledAt: new Date()
    };
  }

  async fetchOrder(orderId: string): Promise<VenueOrderResult | null> {
    try {
      const order = await this.authenticatedClient().then((client) => client.getOrder(orderId));
      return mapPolymarketOpenOrder(order);
    } catch (error) {
      if (/404|not found/i.test(error instanceof Error ? error.message : String(error))) return null;
      throw error;
    }
  }

  private async authenticatedClient(): Promise<ClobClient> {
    if (!this.clobClient) throw new Error('Polymarket credentials are required for authenticated operations.');
    if (!this.clobClient.creds) {
      const creds = await this.clobClient.createOrDeriveApiKey();
      this.clobClient = new ClobClient({
        host: this.clobUrl,
        chain: this.clobClient.chainId,
        signer: this.clobClient.signer,
        creds,
        signatureType: this.clobClient.signatureType,
        funderAddress: this.clobClient.funderAddress,
        throwOnError: true
      });
    }
    return this.clobClient;
  }

  private tokenIdFor(marketId: string, side: NewOrder['side']): string {
    const mapped = this.outcomeTokenIds.get(marketId);
    const tokenId = side === 'yes' ? mapped?.yes : mapped?.no;
    if (tokenId) return tokenId;
    if (side === 'yes') return marketId.replace(/^polymarket:/, '');
    throw new Error(`Polymarket NO token is not known for ${marketId}; scanner must hydrate outcome token IDs before live execution.`);
  }
}

export interface PolymarketAuthConfig {
  privateKey?: string;
  creds?: ApiKeyCreds;
  funderAddress?: string;
  signatureType?: SignatureTypeV2;
  chainId?: Chain;
}

function parsePolymarketTokenIds(row: Record<string, unknown>): { yes: string; no?: string } {
  const rawTokenIds = parseUnknownArray(row.clobTokenIds ?? row.clob_token_ids ?? row.tokenIds ?? row.token_ids);
  const rawOutcomes = parseUnknownArray(row.outcomes ?? row.outcomeNames ?? row.outcome_names).map((value) => String(value).toLowerCase());
  const yesIndex = rawOutcomes.findIndex((outcome) => outcome === 'yes');
  const noIndex = rawOutcomes.findIndex((outcome) => outcome === 'no');
  const yes = String(rawTokenIds[yesIndex >= 0 ? yesIndex : 0] ?? row.clobTokenId ?? row.token_id ?? '');
  const noValue = rawTokenIds[noIndex >= 0 ? noIndex : 1];
  return { yes, no: noValue === undefined ? undefined : String(noValue) };
}

function parseUnknownArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function mapPolymarketOrderResponse(response: OrderResponse, clientOrderId: string): VenueOrderResult {
  const filledQuantity = Number(response.takingAmount || response.makingAmount || 0);
  return {
    venueOrderId: response.orderID,
    clientOrderId,
    state: polymarketOrderState(response.status),
    filledQuantity,
    raw: response
  };
}

function mapPolymarketOpenOrder(order: OpenOrder): VenueOrderResult {
  return {
    venueOrderId: order.id,
    clientOrderId: order.id,
    state: polymarketOrderState(order.status),
    filledQuantity: Number(order.size_matched),
    averagePrice: Number(order.price),
    raw: order
  };
}

function polymarketOrderState(status: string) {
  const normalized = status.toLowerCase();
  if (/filled|matched/.test(normalized)) return 'FILLED';
  if (/partial/.test(normalized)) return 'PARTIALLY_FILLED';
  if (/cancel|expired/.test(normalized)) return 'CANCEL_CONFIRMED';
  if (/reject|fail|error/.test(normalized)) return 'REJECTED';
  return 'ACCEPTED_BY_CLOB';
}

function normalizeUsdcAmount(value: number): number {
  return value > 100_000 ? value / 1_000_000 : value;
}

async function assertPolymarketAllowance(client: ClobClient, tokenID: string, order: NewOrder): Promise<void> {
  const collateral = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
  const requiredNotional = order.quantity * order.limitPrice;
  const balance = normalizeUsdcAmount(Number(collateral.balance));
  if (balance < requiredNotional) throw new Error(`insufficient Polymarket collateral balance for order notional ${requiredNotional}`);
  if (!hasUsableAllowance(collateral.allowances, requiredNotional)) throw new Error('insufficient Polymarket collateral allowance for CLOB order');
  const conditional = await client.getBalanceAllowance({ asset_type: AssetType.CONDITIONAL, token_id: tokenID });
  if (!hasUsableAllowance(conditional.allowances, order.quantity)) throw new Error('insufficient Polymarket conditional token allowance for CLOB order');
}

function hasUsableAllowance(allowances: Record<string, string>, required: number): boolean {
  const values = Object.values(allowances).map((value) => normalizeUsdcAmount(Number(value))).filter(Number.isFinite);
  return values.length > 0 && values.some((value) => value >= required);
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
