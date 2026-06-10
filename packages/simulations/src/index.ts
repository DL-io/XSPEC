export interface SimulationTrade { predictedProbability: number; outcome: 0 | 1; edge: number; pnl: number; equity: number; }
export interface SimulationReport { winRate: number; averageEdge: number; brierScore: number; sharpeLike?: number; maxDrawdown: number; }

export function summarizeReplay(trades: SimulationTrade[]): SimulationReport {
  if (trades.length === 0) throw new Error('Replay input is required; no simulated or generated trade data is allowed.');
  const winRate = trades.filter((trade) => trade.pnl > 0).length / trades.length;
  const averageEdge = trades.reduce((sum, trade) => sum + trade.edge, 0) / trades.length;
  const brierScore = trades.reduce((sum, trade) => sum + (trade.predictedProbability - trade.outcome) ** 2, 0) / trades.length;
  const returns = trades.map((trade) => trade.pnl);
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const std = Math.sqrt(returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length);
  let peak = trades[0].equity;
  let maxDrawdown = 0;
  for (const trade of trades) {
    peak = Math.max(peak, trade.equity);
    maxDrawdown = Math.max(maxDrawdown, peak === 0 ? 0 : (peak - trade.equity) / peak);
  }
  return { winRate, averageEdge, brierScore, sharpeLike: std > 0 ? mean / std : undefined, maxDrawdown };
}

export interface BacktestMarket {
  id: string;
  question: string;
  resolutionCriteria: string;
  category: string;
  volume: number;
  entryPrice: number;
  resolutionDate: Date;
  outcome: 0 | 1;
  priceHistory: Array<{ timestamp: number; price: number }>;
}

export interface BacktestTrade extends SimulationTrade {
  marketId: string;
  question: string;
  category: string;
  entryPrice: number;
  predictedSide: 'yes' | 'no';
  daysToResolution: number;
}

export interface BacktestConfig {
  initialEquity: number;
  fractionalKelly: number;
  minEdge: number;
  maxPositionFraction: number;
  transactionCostBps: number;
}

export function simulateBacktestTrade(
  market: BacktestMarket,
  predictedProbability: number,
  config: BacktestConfig,
  runningEquity: number
): BacktestTrade | null {
  const yesEdge = predictedProbability - market.entryPrice;
  const noEdge = (1 - predictedProbability) - (1 - market.entryPrice);
  const side = yesEdge >= noEdge ? 'yes' : 'no';
  const edge = side === 'yes' ? yesEdge : noEdge;
  const limitPrice = side === 'yes' ? market.entryPrice : (1 - market.entryPrice);
  if (edge < config.minEdge) return null;

  const kellyFraction = edge / Math.max(0.001, 1 - limitPrice);
  const positionFraction = Math.min(config.maxPositionFraction, kellyFraction * config.fractionalKelly);
  const positionSize = runningEquity * positionFraction;
  const transactionCost = positionSize * (config.transactionCostBps / 10_000);

  const resolvedCorrectly = side === 'yes' ? market.outcome === 1 : market.outcome === 0;
  const grossPnl = resolvedCorrectly ? positionSize * edge : -positionSize * limitPrice;
  const pnl = grossPnl - transactionCost;
  const newEquity = runningEquity + pnl;

  return {
    marketId: market.id,
    question: market.question,
    category: market.category,
    entryPrice: market.entryPrice,
    predictedSide: side,
    daysToResolution: Math.max(0, (market.resolutionDate.getTime() - Date.now()) / 86_400_000),
    predictedProbability,
    outcome: market.outcome,
    edge,
    pnl,
    equity: newEquity
  };
}
