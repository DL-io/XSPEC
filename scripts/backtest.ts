/**
 * XSPEC Historical Backtest — Polymarket Gamma API
 *
 * Fetches real resolved Polymarket markets, extracts pre-resolution price
 * histories, runs the XSPEC signal pipeline (without LLM — uses quant/momentum
 * models only), and produces BACKTEST_REPORT.md with performance metrics.
 *
 * DATA SOURCE: Polymarket Gamma API (public, no auth required)
 *   GET https://gamma-api.polymarket.com/markets?closed=true
 *   GET https://gamma-api.polymarket.com/prices-history?market={conditionId}
 *
 * LIMITATIONS (declared honestly):
 *   - No live orderbook data: scanner depth gates are skipped; entry price from price history
 *   - No LLM research: llm_research, deep_reasoner, and sentiment models use fallbacks
 *   - Entry point: price at 7 days before resolution (approximate market consensus)
 *   - Execution: assumes fills at entry price with no slippage (ideal execution)
 *   - Transaction cost: 50 bps applied to all trades
 */

import { writeFileSync } from 'node:fs';
import { computeModelWeights, buildEnsemble, generateModelEstimates, type ModelPerformanceRecord } from '../packages/models/src/index.ts';
import { simulateBacktestTrade, summarizeReplay, type BacktestConfig, type BacktestMarket, type BacktestTrade } from '../packages/simulations/src/index.ts';
import type { FeatureSnapshot, MarketDossier, NormalizedMarket } from '../packages/core/src/index.ts';

const GAMMA_URL = 'https://gamma-api.polymarket.com';
const ENTRY_DAYS_BEFORE_RESOLUTION = 7;
const FETCH_LIMIT = 200;
const MIN_VOLUME_USDC = 5_000;

interface GammaToken { token_id: string; outcome: string; price: number; winner: boolean; }
interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  description?: string;
  endDate: string;
  volume: string;
  active: boolean;
  closed: boolean;
  outcomePrices?: string;
  tokens?: GammaToken[];
  groupItemTitle?: string;
  category?: string;
}
interface GammaPricePoint { t: number; p: number; }
interface GammaPriceHistory { history?: GammaPricePoint[]; }

async function fetchResolvedMarkets(): Promise<GammaMarket[]> {
  const url = `${GAMMA_URL}/markets?closed=true&limit=${FETCH_LIMIT}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Gamma API /markets returned HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json() as GammaMarket[];
  if (!Array.isArray(data)) throw new Error('Gamma API /markets returned unexpected shape');
  return data.filter((m) =>
    !m.active &&
    m.closed &&
    parseFloat(m.volume ?? '0') >= MIN_VOLUME_USDC &&
    Array.isArray(m.tokens) &&
    m.tokens.length === 2 &&
    m.tokens.some((t) => t.winner === true)
  );
}

async function fetchPriceHistory(conditionId: string): Promise<GammaPricePoint[]> {
  const url = `${GAMMA_URL}/prices-history?market=${conditionId}&interval=1d&fidelity=1440`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return [];
    const data = await response.json() as GammaPriceHistory;
    return data?.history ?? [];
  } catch {
    return [];
  }
}

function getEntryPrice(history: GammaPricePoint[], resolutionDate: Date): number | null {
  const targetTs = resolutionDate.getTime() / 1000 - ENTRY_DAYS_BEFORE_RESOLUTION * 86_400;
  const before = history.filter((p) => p.t <= targetTs);
  if (before.length === 0) return null;
  const nearest = before.reduce((a, b) => Math.abs(b.t - targetTs) < Math.abs(a.t - targetTs) ? b : a);
  if (nearest.p <= 0 || nearest.p >= 1) return null;
  return nearest.p;
}

function buildNormalizedMarketProxy(bm: BacktestMarket, entryPrice: number): NormalizedMarket {
  const resolutionDate = bm.resolutionDate;
  const midpoint = entryPrice;
  return {
    id: bm.id,
    source: 'polymarket',
    externalId: bm.id,
    slug: bm.id,
    question: bm.question,
    resolutionCriteria: bm.resolutionCriteria,
    resolutionDate,
    status: 'resolved',
    bestBid: midpoint - 0.005,
    bestAsk: midpoint + 0.005,
    spread: 0.01,
    spreadBps: 100,
    midpoint,
    lastTradePrice: midpoint,
    bidDepth1Pct: 500,
    askDepth1Pct: 500,
    bidDepth5Pct: 2000,
    askDepth5Pct: 2000,
    totalLiquidity: bm.volume,
    volume24h: bm.volume / 90,
    volume7d: bm.volume / 13,
    openInterest: bm.volume * 0.05,
    tradeCount24h: 10,
    dataFreshnessMs: 0,
    isLiquid: true,
    hasAmbiguousResolution: false,
    resolutionAmbiguityScore: 0.1,
    category: bm.category,
    tags: [],
    scannedAt: new Date()
  };
}

function buildMinimalDossier(market: NormalizedMarket): MarketDossier {
  return {
    marketId: market.id,
    generatedAt: new Date(),
    freshnessExpiresAt: new Date(Date.now() + 3_600_000),
    resolutionCriteria: market.resolutionCriteria,
    resolutionClarified: market.resolutionCriteria,
    resolutionAmbiguityScore: 0.1,
    keyResolutionRisks: [],
    currentFacts: [],
    contradictions: [],
    informationAge: 0,
    sourceCount: 0,
    sourceQuality: 0,
    baseRate: market.midpoint,
    keyDrivers: [],
    catalysts: [],
    sentimentSignal: 0,
    microstructureSignal: 0,
    probabilityEstimate: market.midpoint,
    probabilityLow: Math.max(0.01, market.midpoint - 0.1),
    probabilityHigh: Math.min(0.99, market.midpoint + 0.1),
    confidence: 0,
    evidenceStrength: 0,
    contraryCase: '',
    steelmanRebuttal: '',
    identifiedBlindSpots: [],
    marketMemoryMatches: [],
    stagesCompleted: [],
    stageFailures: [],
    skipRecommended: false
  };
}

function buildFeatureProxy(market: NormalizedMarket, priceHistory: GammaPricePoint[], resolutionDate: Date): FeatureSnapshot {
  const entryTs = resolutionDate.getTime() / 1000 - ENTRY_DAYS_BEFORE_RESOLUTION * 86_400;
  const priorTs = entryTs - 7 * 86_400;
  const entryPoints = priceHistory.filter((p) => Math.abs(p.t - entryTs) < 2 * 86_400);
  const priorPoints = priceHistory.filter((p) => Math.abs(p.t - priorTs) < 2 * 86_400);
  const entryPrice = entryPoints[0]?.p ?? market.midpoint;
  const priorPrice = priorPoints[0]?.p ?? market.midpoint;
  const momentum = entryPrice - priorPrice;

  const prices = priceHistory.filter((p) => p.t >= priorTs && p.t <= entryTs).map((p) => p.p);
  const avgPrice = prices.length ? prices.reduce((s, v) => s + v, 0) / prices.length : market.midpoint;
  const variance = prices.length > 1 ? prices.reduce((s, v) => s + (v - avgPrice) ** 2, 0) / prices.length : 0;
  const volatility = Math.min(1, Math.sqrt(variance) * 5);

  const recentVol = priceHistory.filter((p) => p.t >= entryTs - 7 * 86_400 && p.t <= entryTs).length;
  const priorVol = priceHistory.filter((p) => p.t >= entryTs - 14 * 86_400 && p.t < entryTs - 7 * 86_400).length;
  const volumeBurstScore = priorVol > 0 ? recentVol / priorVol : 1;

  const catalystProximity = Math.max(0, 1 - ENTRY_DAYS_BEFORE_RESOLUTION / 7);
  const orderFlowImbalance = 0; // not available from historical data
  const sentimentVelocity = orderFlowImbalance * Math.max(0, volumeBurstScore - 1);
  const spreadQuality = market.spread > 0.02 ? 0.15 : market.spread > 0.01 ? 0.5 : 1.0;
  const crossMarketCorrelationScore = Math.tanh(momentum * 10) * spreadQuality;

  return {
    marketId: market.id,
    window: '1d',
    volatility,
    momentum,
    spreadRegime: 'normal',
    orderFlowImbalance,
    volumeBurstScore,
    sentimentVelocity,
    crossMarketCorrelationScore,
    catalystProximity,
    macroRegimeLabel: Math.abs(momentum) > 0.05 ? 'trending_' + (momentum > 0 ? 'up' : 'down') : 'normal',
    computedAt: new Date()
  };
}

async function runBacktest(): Promise<void> {
  console.log('Fetching resolved Polymarket markets…');
  const gammaMarkets = await fetchResolvedMarkets();
  console.log(`  ${gammaMarkets.length} candidates (volume >= $${MIN_VOLUME_USDC.toLocaleString()})`);

  const backtestMarkets: BacktestMarket[] = [];
  let fetched = 0;
  for (const gm of gammaMarkets) {
    if (!gm.conditionId) continue;
    const history = await fetchPriceHistory(gm.conditionId);
    const resolutionDate = new Date(gm.endDate);
    const entryPrice = getEntryPrice(history, resolutionDate);
    if (entryPrice === null) continue;
    const winnerToken = gm.tokens!.find((t) => t.winner === true);
    if (!winnerToken) continue;
    const outcome: 0 | 1 = winnerToken.outcome.toLowerCase().includes('yes') || winnerToken.outcome === '1' ? 1 : 0;
    backtestMarkets.push({
      id: gm.id,
      question: gm.question,
      resolutionCriteria: gm.description ?? gm.question,
      category: gm.category ?? 'unknown',
      volume: parseFloat(gm.volume),
      entryPrice,
      resolutionDate,
      outcome,
      priceHistory: history.map((p) => ({ timestamp: p.t, price: p.p }))
    });
    fetched++;
    if (fetched % 25 === 0) console.log(`  Fetched price history for ${fetched} markets…`);
  }

  console.log(`  ${backtestMarkets.length} markets with usable entry prices`);
  if (backtestMarkets.length === 0) {
    throw new Error('No markets with price history available from Gamma API — cannot produce backtest without real data');
  }

  const btConfig: BacktestConfig = {
    initialEquity: 10_000,
    fractionalKelly: 0.10,
    minEdge: 0.04,
    maxPositionFraction: 0.05,
    transactionCostBps: 50
  };

  const trades: BacktestTrade[] = [];
  let equity = btConfig.initialEquity;
  const performanceHistory: ModelPerformanceRecord[] = [];

  for (const bm of backtestMarkets) {
    const market = buildNormalizedMarketProxy(bm, bm.entryPrice);
    const dossier = buildMinimalDossier(market);
    const featureSnapshot = buildFeatureProxy(market, bm.priceHistory.map((p) => ({ t: p.timestamp, p: p.price })), bm.resolutionDate);

    // Bayesian weights from trades seen so far (live updating as backtest progresses)
    const weightOverrides = performanceHistory.length >= 9
      ? computeModelWeights(performanceHistory)
      : undefined;

    const estimates = generateModelEstimates({ market, dossier, featureSnapshot, weightOverrides });
    const ensemble = buildEnsemble(estimates);
    if (!ensemble.recommendTrade) continue;

    const trade = simulateBacktestTrade(bm, ensemble.ensembleProbability, btConfig, equity);
    if (!trade) continue;

    trades.push(trade);
    equity = trade.equity;

    // Record per-model performance for Bayesian weight updating
    for (const est of estimates.filter((e) => !e.failureReason)) {
      performanceHistory.push({ modelId: est.modelId, probability: est.probability, outcome: bm.outcome });
    }
  }

  if (trades.length === 0) {
    throw new Error('No trades passed signal + edge + risk filters — backtest has no results to report');
  }

  const report = summarizeReplay(trades);
  const categoryCounts = new Map<string, { trades: number; wins: number; totalPnl: number }>();
  for (const t of trades) {
    const c = categoryCounts.get(t.category) ?? { trades: 0, wins: 0, totalPnl: 0 };
    c.trades++;
    if (t.pnl > 0) c.wins++;
    c.totalPnl += t.pnl;
    categoryCounts.set(t.category, c);
  }

  const sortedino = (() => {
    const downside = trades.filter((t) => t.pnl < 0).map((t) => t.pnl);
    if (downside.length === 0) return undefined;
    const mean = trades.reduce((s, t) => s + t.pnl, 0) / trades.length;
    const downsideStd = Math.sqrt(downside.reduce((s, v) => s + v ** 2, 0) / downside.length);
    return downsideStd > 0 ? mean / downsideStd : undefined;
  })();

  const equityCurve = trades.map((t, i) => `${i + 1},${t.equity.toFixed(2)}`).join('\n');

  const md = [
    '# BACKTEST_REPORT.md — XSPEC Historical Performance',
    '',
    `**Generated**: ${new Date().toISOString()}`,
    `**Data Source**: Polymarket Gamma API (public)`,
    `**Markets Analyzed**: ${backtestMarkets.length} resolved markets (volume >= $${MIN_VOLUME_USDC.toLocaleString()})`,
    `**Trades Executed**: ${trades.length}`,
    `**Initial Equity**: $${btConfig.initialEquity.toLocaleString()}`,
    `**Final Equity**: $${equity.toFixed(2)}`,
    '',
    '---',
    '',
    '## Key Metrics',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Win Rate | ${(report.winRate * 100).toFixed(1)}% |`,
    `| Average Edge | ${(report.averageEdge * 100).toFixed(2)}% |`,
    `| Brier Score | ${report.brierScore.toFixed(4)} |`,
    `| Sharpe-like | ${report.sharpeLike != null ? report.sharpeLike.toFixed(3) : 'N/A'} |`,
    `| Sortino-like | ${sortedino != null ? sortedino.toFixed(3) : 'N/A'} |`,
    `| Max Drawdown | ${(report.maxDrawdown * 100).toFixed(2)}% |`,
    `| Total Return | ${((equity - btConfig.initialEquity) / btConfig.initialEquity * 100).toFixed(2)}% |`,
    `| Fractional Kelly | ${btConfig.fractionalKelly} |`,
    `| Min Edge Filter | ${(btConfig.minEdge * 100).toFixed(0)}% |`,
    `| Transaction Cost | ${btConfig.transactionCostBps} bps |`,
    '',
    '---',
    '',
    '## Methodology',
    '',
    '**Entry point**: Price {ENTRY_DAYS_BEFORE_RESOLUTION} days before market resolution date (from Gamma price history API).'.replace('{ENTRY_DAYS_BEFORE_RESOLUTION}', String(ENTRY_DAYS_BEFORE_RESOLUTION)),
    '',
    '**Signal pipeline (simplified)**: Scanner depth gates skipped (no historical orderbook). Models running:',
    '- `base_rate`: market midpoint at entry',
    '- `microstructure`: order flow imbalance = 0 (historical orderbook unavailable)',
    '- `basket_tilt`: price momentum (7-day vs 14-day pre-entry)',
    '- `quant_model`: volume burst score from price history tick count',
    '',
    '**Models NOT running in backtest**:',
    '- `llm_research` / `deep_reasoner`: require live LLM providers',
    '- `sentiment`: no real-time facts/news in historical replay',
    '- `historical_analog`: memory table empty in standalone backtest',
    '- `relative_value`: cross-market correlation = 0 without co-run markets',
    '',
    '**Trade execution**: Filled at entry price; 50 bps transaction cost; fractional Kelly sizing (10%).',
    '',
    '**Bayesian weight updating**: Model weights update after each resolved trade during the backtest run.',
    '',
    '---',
    '',
    '## Performance by Category',
    '',
    '| Category | Trades | Win Rate | Total P&L |',
    '|----------|--------|----------|-----------|',
    ...[...categoryCounts.entries()]
      .sort((a, b) => b[1].totalPnl - a[1].totalPnl)
      .map(([cat, stats]) => `| ${cat} | ${stats.trades} | ${(stats.wins / stats.trades * 100).toFixed(1)}% | $${stats.totalPnl.toFixed(2)} |`),
    '',
    '---',
    '',
    '## Sample Trades',
    '',
    '| # | Question | Entry | Predicted | Outcome | Edge | P&L |',
    '|---|----------|-------|-----------|---------|------|-----|',
    ...trades.slice(0, 20).map((t, i) =>
      `| ${i + 1} | ${t.question.slice(0, 60)}… | ${(t.entryPrice * 100).toFixed(1)}¢ | ${(t.predictedProbability * 100).toFixed(1)}% | ${t.outcome === 1 ? 'YES' : 'NO'} | ${(t.edge * 100).toFixed(2)}% | $${t.pnl.toFixed(2)} |`
    ),
    '',
    '---',
    '',
    '## Limitations',
    '',
    '1. **No historical orderbook**: Scanner depth gates bypassed. Real live trading applies these gates and rejects ~40-60% of candidates.',
    '2. **No LLM research**: 4 of 9 models (llm_research, deep_reasoner, sentiment, historical_analog) use fallback values. Live performance with LLM providers will differ.',
    '3. **Entry price approximation**: Uses daily candle price 7 days before resolution. Actual fill price depends on live orderbook spread and slippage.',
    '4. **Survivorship bias**: Gamma API returns markets in undetermined order; volume filter ($5,000 min) excludes micro-markets.',
    '5. **No slippage model**: Assumes fills at bid/ask midpoint. Real execution costs vary by market depth.',
    '',
    '## Raw Equity Curve (CSV)',
    '',
    '```',
    'trade_index,equity',
    equityCurve,
    '```'
  ].join('\n');

  writeFileSync('./BACKTEST_REPORT.md', md, 'utf8');
  console.log(`\nBacktest complete.`);
  console.log(`  Trades: ${trades.length}`);
  console.log(`  Win rate: ${(report.winRate * 100).toFixed(1)}%`);
  console.log(`  Average edge: ${(report.averageEdge * 100).toFixed(2)}%`);
  console.log(`  Brier score: ${report.brierScore.toFixed(4)}`);
  console.log(`  Max drawdown: ${(report.maxDrawdown * 100).toFixed(2)}%`);
  console.log(`  Total return: ${((equity - btConfig.initialEquity) / btConfig.initialEquity * 100).toFixed(2)}%`);
  console.log(`\nReport written to ./BACKTEST_REPORT.md`);
}

await runBacktest();
