const now = new Date();
const ts = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();

export const DEMO_OVERVIEW = {
  safety: {
    killSwitchActive: false,
    killSwitchReason: '',
    liveAuthorized: false,
    liveAuthorizationReason: undefined
  },
  reconciliation: {
    tenantId: 'system',
    severeMismatchOpen: false,
    incident: undefined,
    acknowledged: false
  },
  portfolio: {
    tenantId: 'system',
    equity: 12847.23,
    cash: 8392.15,
    totalExposure: 0.347,
    categoryExposure: { politics: 0.18, crypto: 0.12, sports: 0.047 },
    dailyPnl: 284.71,
    maxDrawdown: 0.031,
    openOrderCount: 2,
    severeMismatchOpen: false,
    positions: [
      { id: 'demo-pos-1', marketId: 'demo:polymarket:trump-approval-2026', side: 'yes', quantity: 245, averagePrice: 0.58, marketValue: 151.10, category: 'politics', venue: 'polymarket' },
      { id: 'demo-pos-2', marketId: 'demo:polymarket:bitcoin-100k-2026', side: 'yes', quantity: 180, averagePrice: 0.67, marketValue: 127.80, category: 'crypto', venue: 'polymarket' },
      { id: 'demo-pos-3', marketId: 'demo:kalshi:fed-rate-cut-q3', side: 'no', quantity: 300, averagePrice: 0.31, marketValue: 96.30, category: 'macro', venue: 'kalshi' }
    ]
  },
  portfolioHistory: Array.from({ length: 24 }, (_, i) => ({
    equity: 12000 + Math.sin(i * 0.4) * 300 + i * 35,
    capturedAt: ts(-(23 - i) * 3_600_000)
  })),
  audits: [
    { id: 'demo-audit-1', marketId: 'demo:polymarket:trump-approval-2026', scannerData: { question: "Will Trump's approval rating exceed 50% by end of Q2 2026?" }, ensembleOutput: { ensembleProbability: 0.58, ensembleConfidence: 0.78 }, edgeCalculations: { edge: 0.072, penalizedEdge: 0.058 }, riskDecision: { approved: true }, finalOutcome: 'trade', opportunityScore: 72, createdAt: ts(-900_000) },
    { id: 'demo-audit-2', marketId: 'demo:polymarket:bitcoin-100k-2026', scannerData: { question: 'Will Bitcoin reach $100K by September 2026?' }, ensembleOutput: { ensembleProbability: 0.67, ensembleConfidence: 0.82 }, edgeCalculations: { edge: 0.085, penalizedEdge: 0.071 }, riskDecision: { approved: true }, finalOutcome: 'trade', opportunityScore: 84, createdAt: ts(-1_800_000) },
    { id: 'demo-audit-3', marketId: 'demo:kalshi:fed-rate-cut-q3', scannerData: { question: 'Will the Fed cut rates in Q3 2026?' }, ensembleOutput: { ensembleProbability: 0.31, ensembleConfidence: 0.71 }, edgeCalculations: { edge: 0.051, penalizedEdge: 0.041 }, riskDecision: { approved: false }, finalOutcome: 'skip', opportunityScore: 41, createdAt: ts(-2_700_000) },
    { id: 'demo-audit-4', marketId: 'demo:polymarket:uk-election-2026', scannerData: { question: 'Will Labour retain majority in UK 2026 by-elections?' }, ensembleOutput: { ensembleProbability: 0.44, ensembleConfidence: 0.65 }, edgeCalculations: { edge: 0.023, penalizedEdge: 0.016 }, riskDecision: { approved: false }, finalOutcome: 'skip', opportunityScore: 16, createdAt: ts(-3_600_000) },
    { id: 'demo-audit-5', marketId: 'demo:polymarket:openai-gpt5-q2', scannerData: { question: 'Will OpenAI release GPT-5 before July 2026?' }, ensembleOutput: { ensembleProbability: 0.73, ensembleConfidence: 0.69 }, edgeCalculations: { edge: 0.062, penalizedEdge: 0.053 }, riskDecision: { approved: true }, finalOutcome: 'trade', opportunityScore: 59, createdAt: ts(-4_500_000) }
  ],
  orders: [
    { id: 'demo-order-1', marketId: 'demo:polymarket:trump-approval-2026', side: 'yes', quantity: 50, limitPrice: 0.57, state: 'ACCEPTED_BY_CLOB', createdAt: ts(-600_000) },
    { id: 'demo-order-2', marketId: 'demo:polymarket:openai-gpt5-q2', side: 'yes', quantity: 30, limitPrice: 0.72, state: 'INTENT_CREATED', createdAt: ts(-300_000) }
  ],
  workers: [
    { worker: 'scanner', status: 'ok', lastHeartbeatAt: ts(-8_000) },
    { worker: 'research', status: 'ok', lastHeartbeatAt: ts(-12_000) },
    { worker: 'execution', status: 'ok', lastHeartbeatAt: ts(-5_000) },
    { worker: 'reconciliation', status: 'ok', lastHeartbeatAt: ts(-18_000) },
    { worker: 'calibration', status: 'ok', lastHeartbeatAt: ts(-22_000) },
    { worker: 'alerts', status: 'ok', lastHeartbeatAt: ts(-15_000) }
  ]
};

export const DEMO_SIGNALS = [
  { marketId: 'demo:polymarket:trump-approval-2026', probability: 0.58, uncertainty: 0.072, confidence: 0.78, finalOutcome: 'trade', riskApproved: true, opportunityScore: 72, createdAt: ts(-900_000) },
  { marketId: 'demo:polymarket:bitcoin-100k-2026', probability: 0.67, uncertainty: 0.051, confidence: 0.82, finalOutcome: 'trade', riskApproved: true, opportunityScore: 84, createdAt: ts(-1_800_000) },
  { marketId: 'demo:kalshi:fed-rate-cut-q3', probability: 0.31, uncertainty: 0.089, confidence: 0.71, finalOutcome: 'skip', riskApproved: false, opportunityScore: 41, createdAt: ts(-2_700_000) },
  { marketId: 'demo:polymarket:openai-gpt5-q2', probability: 0.73, uncertainty: 0.062, confidence: 0.69, finalOutcome: 'trade', riskApproved: true, opportunityScore: 59, createdAt: ts(-4_500_000) },
  { marketId: 'demo:polymarket:uk-election-2026', probability: 0.44, uncertainty: 0.104, confidence: 0.65, finalOutcome: 'skip', riskApproved: false, opportunityScore: 16, createdAt: ts(-3_600_000) }
];
