import type { NormalizedMarket, OrderbookSnapshot } from '@polyshore/core';

export interface ScannerDecision { accepted: boolean; hardRejectReasons: string[]; softWarnings: string[]; }

export function resolutionAmbiguityScore(text: string): number {
  const lower = text.toLowerCase();
  const ambiguousTerms = ['substantially', 'materially', 'approximately', 'reasonable', 'credible reports', 'may include', 'unclear'];
  const matches = ambiguousTerms.filter((term) => lower.includes(term)).length;
  return Math.min(1, matches * 0.18 + (text.length < 80 ? 0.15 : 0));
}

export function evaluateScannerGates(market: NormalizedMarket, now = new Date(), strictMode = true): ScannerDecision {
  const hardRejectReasons: string[] = [];
  const softWarnings: string[] = [];
  const hoursToResolution = (market.resolutionDate.getTime() - now.getTime()) / 3_600_000;
  if (market.source === 'polymarket' && !isValidPolymarketTokenId(market.externalId)) hardRejectReasons.push('malformed Polymarket token id');
  if (!market.resolutionCriteria || market.resolutionCriteria.trim().length < 20) hardRejectReasons.push('missing resolution criteria');
  if (market.spread > 0.03) hardRejectReasons.push('spread > 3%');
  if (market.totalLiquidity < 500) hardRejectReasons.push('totalLiquidity < 500 USD');
  if (market.dataFreshnessMs > 30_000) hardRejectReasons.push('dataFreshnessMs > 30,000');
  if (hoursToResolution < 2) hardRejectReasons.push('resolutionDate < now + 2 hours');
  if (market.status !== 'active') hardRejectReasons.push('status != active');
  if (market.hasAmbiguousResolution && strictMode) hardRejectReasons.push('ambiguous resolution and strict mode enabled');
  if (market.volume24h < 200) hardRejectReasons.push('volume24h < 200 USD');
  if (market.bestBid <= 0) hardRejectReasons.push('bestBid <= 0');
  if (market.bestAsk <= 0) hardRejectReasons.push('bestAsk <= 0');
  if (market.bestBid >= market.bestAsk) hardRejectReasons.push('bestBid >= bestAsk');
  if (market.bidDepth1Pct <= 0 || market.askDepth1Pct <= 0) hardRejectReasons.push('missing executable top-of-book depth');
  if (market.midpoint <= 0.02 || market.midpoint >= 0.98) hardRejectReasons.push('midpoint outside tradable band');
  if (market.volume24h < 1000) softWarnings.push('volume24h < 1000 USD');
  if (market.spread > 0.015) softWarnings.push('spread > 1.5%');
  if (hoursToResolution < 24) softWarnings.push('resolutionDate < now + 24 hours');
  if (market.bidDepth1Pct < 100) softWarnings.push('bidDepth1Pct < 100 USD');
  return { accepted: hardRejectReasons.length === 0, hardRejectReasons, softWarnings };
}

export function applyOrderbookSnapshot(market: NormalizedMarket, book: OrderbookSnapshot): NormalizedMarket {
  const bids = normalizeLevels(book.bids, 'bid');
  const asks = normalizeLevels(book.asks, 'ask');
  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;
  const midpoint = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : market.midpoint;
  const bidDepth1Pct = depthWithin(bids, midpoint, 0.01, 'bid');
  const askDepth1Pct = depthWithin(asks, midpoint, 0.01, 'ask');
  const bidDepth5Pct = depthWithin(bids, midpoint, 0.05, 'bid');
  const askDepth5Pct = depthWithin(asks, midpoint, 0.05, 'ask');
  return {
    ...market,
    bestBid,
    bestAsk,
    midpoint,
    spread: Math.max(0, bestAsk - bestBid),
    spreadBps: midpoint > 0 ? ((bestAsk - bestBid) / midpoint) * 10_000 : 0,
    bidDepth1Pct,
    askDepth1Pct,
    bidDepth5Pct,
    askDepth5Pct,
    dataFreshnessMs: Date.now() - book.capturedAt.getTime(),
    scannedAt: new Date()
  };
}

export function normalizeLevels(levels: { price: number; size: number }[], side: 'bid' | 'ask'): { price: number; size: number }[] {
  return levels
    .filter((level) => Number.isFinite(level.price) && Number.isFinite(level.size) && level.price > 0 && level.price < 1 && level.size > 0)
    .sort((a, b) => side === 'bid' ? b.price - a.price : a.price - b.price);
}

export function isValidPolymarketTokenId(tokenId: string): boolean {
  return /^\d{20,80}$/.test(tokenId);
}

function depthWithin(levels: { price: number; size: number }[], midpoint: number, pct: number, side: 'bid' | 'ask'): number {
  if (midpoint <= 0) return 0;
  return levels
    .filter((level) => side === 'bid' ? level.price >= midpoint * (1 - pct) : level.price <= midpoint * (1 + pct))
    .reduce((sum, level) => sum + level.price * level.size, 0);
}
