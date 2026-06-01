import type { NormalizedMarket } from '@polyshore/core';

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
  if (market.midpoint <= 0.02 || market.midpoint >= 0.98) hardRejectReasons.push('midpoint outside tradable band');
  if (market.volume24h < 1000) softWarnings.push('volume24h < 1000 USD');
  if (market.spread > 0.015) softWarnings.push('spread > 1.5%');
  if (hoursToResolution < 24) softWarnings.push('resolutionDate < now + 24 hours');
  if (market.bidDepth1Pct < 100) softWarnings.push('bidDepth1Pct < 100 USD');
  return { accepted: hardRejectReasons.length === 0, hardRejectReasons, softWarnings };
}
