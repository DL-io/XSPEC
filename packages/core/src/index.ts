export type VenueId = 'polymarket' | 'kalshi' | (string & {});
export type OperatingMode = 'paper' | 'live';
export type ProductPlan = 'private_operator' | 'pro_terminal' | 'institutional_terminal' | 'api_client';
export type Role = 'owner' | 'trader' | 'risk' | 'compliance' | 'viewer' | 'api_only';
export type MarketStatus = 'active' | 'closed' | 'resolved' | 'archived';
export type Side = 'yes' | 'no';
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type ReconciliationSeverity = 'minor' | 'moderate' | 'severe';
export type OrderLifecycleState =
  | 'INTENT_CREATED'
  | 'ORDER_VALIDATED'
  | 'ORDER_SIGNED'
  | 'ORDER_POSTED'
  | 'ACCEPTED_BY_CLOB'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCEL_REQUESTED'
  | 'CANCEL_CONFIRMED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'RECONCILIATION_MISMATCH';

export interface Tenant { id: string; name: string; plan: ProductPlan; liveEnabled: boolean; createdAt: Date; }
export interface User { id: string; email: string; displayName: string; createdAt: Date; }
export interface ApiClient { id: string; tenantId: string; name: string; scopes: string[]; rateLimitPerMinute: number; }
export interface UsageMetric { id: string; tenantId: string; apiClientId?: string; route: string; units: number; recordedAt: Date; }
export interface UnsubscribeFn { (): void; }
export interface FillEvent { orderId: string; marketId: string; side: Side; quantity: number; price: number; filledAt: Date; }
export interface NewOrder { marketId: string; side: Side; quantity: number; limitPrice: number; clientOrderId: string; tokenId?: string; timeInForce?: 'GTC'; }
export interface VenueOrderResult { venueOrderId: string; clientOrderId: string; state: OrderLifecycleState; filledQuantity: number; averagePrice?: number; raw?: unknown; }
export interface VenueCancelResult { venueOrderId: string; confirmed: boolean; raw?: unknown; }

export interface OrderbookSnapshot {
  marketId: string;
  tokenId?: string;
  source: VenueId;
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
  capturedAt: Date;
}

export interface FeatureSnapshot {
  marketId: string;
  window: '1m' | '5m' | '1h' | '1d';
  volatility: number;
  momentum: number;
  spreadRegime: 'tight' | 'normal' | 'wide';
  orderFlowImbalance: number;
  volumeBurstScore: number;
  sentimentVelocity: number;
  crossMarketCorrelationScore: number;
  catalystProximity: number;
  macroRegimeLabel: string;
  computedAt: Date;
}

export interface NormalizedMarket {
  id: string; source: VenueId; externalId: string; slug: string; question: string;
  resolutionCriteria: string; resolutionDate: Date; status: MarketStatus;
  bestBid: number; bestAsk: number; spread: number; spreadBps: number; midpoint: number;
  lastTradePrice: number; bidDepth1Pct: number; askDepth1Pct: number; bidDepth5Pct: number; askDepth5Pct: number;
  totalLiquidity: number; volume24h: number; volume7d: number; openInterest: number; tradeCount24h: number;
  dataFreshnessMs: number; isLiquid: boolean; hasAmbiguousResolution: boolean; resolutionAmbiguityScore: number;
  category: string; tags: string[]; scannedAt: Date; featureSnapshot?: FeatureSnapshot;
}

export interface VenueConnector {
  id: VenueId;
  fetchMarkets(): Promise<NormalizedMarket[]>;
  fetchOrderbook(marketId: string): Promise<OrderbookSnapshot>;
  placeOrder(order: NewOrder): Promise<VenueOrderResult>;
  cancelOrder(orderId: string): Promise<VenueCancelResult>;
  fetchPositions(): Promise<Position[]>;
  fetchPortfolio(): Promise<PortfolioState>;
  fetchOrder(orderId: string): Promise<VenueOrderResult | null>;
  subscribeToFills?(callback: (fill: FillEvent) => void): Promise<UnsubscribeFn>;
}

export interface MarketDossier {
  marketId: string; generatedAt: Date; freshnessExpiresAt: Date; resolutionCriteria: string;
  resolutionClarified: string; resolutionAmbiguityScore: number; keyResolutionRisks: string[];
  currentFacts: { claim: string; source: string; capturedAt: Date }[]; contradictions: string[];
  informationAge: number; sourceCount: number; sourceQuality: number; baseRate: number;
  keyDrivers: string[]; catalysts: string[]; sentimentSignal: number; microstructureSignal: number;
  probabilityEstimate: number; probabilityLow: number; probabilityHigh: number; confidence: number;
  evidenceStrength: number; contraryCase: string; steelmanRebuttal: string; identifiedBlindSpots: string[];
  marketMemoryMatches: MemoryMatch[]; stagesCompleted: string[]; stageFailures: StageFailure[];
  skipRecommended: boolean; skipReason?: string;
}
export interface StageFailure { stage: string; reason: string; retryable: boolean; }
export interface ModelEstimate { modelId: string; probability: number; confidenceWeight: number; evidence: string[]; freshnessScore: number; failureReason?: string; }
export interface EnsembleResult { ensembleProbability: number; ensembleUncertainty: number; ensembleConfidence: number; modelEstimates: ModelEstimate[]; outlierModels: string[]; calibrationAdjustment: number; disagreementScore: number; recommendTrade: boolean; skipReason?: string; }
export interface TradeProposal { marketId: string; side: Side; edge: number; adjustedEdge: number; penalizedEdge: number; opportunityScore: number; suggestedSize: number; limitPrice: number; ensemble: EnsembleResult; }
export interface RiskDecision { approved: boolean; blockedBy?: string; reasons: string[]; coolingPeriodUntil?: Date; evaluatedGates: string[]; maxApprovedSize: number; }
export interface OrderIntent { id: string; tenantId: string; mode: OperatingMode; proposal: TradeProposal; createdAt: Date; }
export interface OrderStateTransition { id: string; orderId: string; from?: OrderLifecycleState; to: OrderLifecycleState; reason: string; createdAt: Date; }
export type ExecutionAuditStatus = 'submitted' | 'rejected' | 'retryable' | 'failed';
export interface ExecutionAuditResult { venueOrderId: string; state: OrderLifecycleState; status?: ExecutionAuditStatus; filledQuantity: number; averagePrice?: number; realizedCost?: number; processedAt: Date; error?: string; }
export interface ReconciliationAuditStatus { checkedAt: Date; severe: boolean; blockNewOrders: boolean; mismatchCount: number; severeReasons: string[]; }
export interface Position { id: string; marketId: string; side: Side; quantity: number; averagePrice: number; marketValue: number; category: string; venue: VenueId; }
export interface PortfolioState { tenantId: string; cash: number; equity: number; totalExposure: number; categoryExposure: Record<string, number>; positions: Position[]; openOrderCount: number; dailyPnl: number; maxDrawdown: number; reconciledAt?: Date; severeMismatchOpen: boolean; }
export interface PortfolioSnapshot extends PortfolioState { id: string; capturedAt: Date; }
export interface DecisionAudit { id: string; marketId: string; tenantId: string; scannerData: NormalizedMarket; capturedOrderbook?: OrderbookSnapshot; featureSnapshot?: FeatureSnapshot; dossierId?: string; dossierSummary?: Partial<MarketDossier>; modelEstimates: ModelEstimate[]; ensembleOutput?: EnsembleResult; tradeProposal?: TradeProposal; edgeCalculations?: Record<string, number>; riskDecision?: RiskDecision; executionResult?: ExecutionAuditResult; reconciliationStatus?: ReconciliationAuditStatus; opportunityScore?: number; finalOutcome: 'trade' | 'skip'; calibrationBackfill?: Partial<CalibrationRecord>; createdAt: Date; }
export interface CalibrationRecord { id: string; marketId: string; resolvedAt: Date; predictedProbability: number; outcome: 0 | 1; brierScore: number; directionalAccuracy: boolean; sharpness: number; modelRecommendations: string[]; }
export interface MemoryMatch { marketId: string; question: string; resolutionCriteria: string; similarity: number; outcome?: 0 | 1; }
export interface ResearchPack { id: string; tenantId: string; title: string; marketIds: string[]; html: string; createdAt: Date; }
export interface AlertEvent { id: string; tenantId: string; severity: AlertSeverity; channel: 'in_app' | 'email' | 'webhook' | 'sms'; eventType: string; message: string; createdAt: Date; }
export interface Playbook { id: string; tenantId: string; name: string; enabled: boolean; filters: Record<string, unknown>; mandate: MandateId; }
export type MandateId = 'ultra_conservative' | 'conservative' | 'balanced' | 'aggressive';
