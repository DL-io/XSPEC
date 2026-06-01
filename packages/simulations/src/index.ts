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
