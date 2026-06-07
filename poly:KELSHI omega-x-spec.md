# POLY-SHORE OMEGA X
Definitive Build Specification
Version 2.0
Date: 2026-05-31
Status: Canonical implementation specification

## 1. Product definition
POLY-SHORE OMEGA X is a premium, institutional-grade prediction market intelligence, execution, and operator platform built for Polymarket and Kalshi first, with a formal extension path for additional venues later. This product is not defined as a “win-rate machine”; it is defined as a disciplined system for verified edge discovery, calibrated probability estimation, portfolio-aware capital allocation, execution control, operator oversight, and monetizable research/API output.

The product has four surfaces sharing one common core:
1. Autonomous Trader: paper and live trading under strict risk controls.
2. Signals API: machine-consumable probability, edge, and calibration outputs.
3. Institutional Terminal: multi-tenant operator workspace with role controls.
4. Research Pack Engine: exportable HTML/PDF-style dossiers for internal and client use.

## 2. Non-negotiable principles
1. Capital safety overrides profit seeking.
2. Paper mode is the default operating mode and the gate to live mode.
3. Reconciliation is authoritative over local state.
4. No trade is placed without validated edge, confidence, and risk approval.
5. Every evaluated market creates an immutable audit record.
6. Intelligence produces distributions with uncertainty, not single-point certainty.
7. All external dependencies use timeouts, retries, and circuit breakers.
8. Monetization layers must not bypass or weaken trading safety controls.
9. Production deployment path must not require Docker.
10. The canonical implementation stack is TypeScript-first.

## 3. Canonical stack
### 3.1 Languages and runtime
- Node.js 20+
- TypeScript 5.5+
- pnpm workspace

### 3.2 Application framework
- Frontend/operator terminal: Next.js 15 App Router
- Backend APIs and orchestration: Next.js route handlers plus dedicated worker processes in TypeScript
- Real-time transport: WebSocket plus tRPC subscriptions
- Validation: Zod

### 3.3 Data layer
- Primary OLTP database: TiDB or MySQL 8.0
- Cache and queues: Redis
- Vector memory: pgvector when available; SQLite-vec or JSON embedding fallback otherwise
- ORM: Drizzle ORM

### 3.4 UI layer
- Tailwind CSS
- shadcn/ui
- TanStack Table
- Recharts for application charts

### 3.5 Deployment
- Primary: Railway
- Self-hosted: PM2 + systemd + Nginx reverse proxy
- Explicitly excluded from canonical production path: Docker Compose and Docker-only deployment

## 4. Monorepo layout
```text
poly-shore-omega-x/
  apps/
    terminal/                      # Next.js operator terminal and API surface
  packages/
    core/                          # domain types, schemas, constants
    config/                        # env parsing, layered config, defaults
    db/                            # drizzle schema, migrations, repositories
    venues/                        # venue connectors and exchange adapters
    scanner/                       # market discovery and normalization
    features/                      # real-time feature computation
    research/                      # dossier pipeline
    models/                        # model registry, ensemble, calibration logic
    portfolio/                     # exposure, optimization, ranking
    risk/                          # risk fortress, mandates, gate engine
    execution/                     # paper engine, live execution, order router
    reconciliation/                # exchange-to-local state reconciliation
    audit/                         # audit writers and replay helpers
    alerts/                        # notification routing
    api/                           # typed API clients and server contracts
    auth/                          # tenants, roles, authn/authz helpers
    reports/                       # research packs, exports
    simulations/                   # replay and Monte Carlo harnesses
    observability/                 # metrics, logs, tracing helpers
  workers/
    scanner-worker/
    research-worker/
    execution-worker/
    reconciliation-worker/
    calibration-worker/
    alert-worker/
  scripts/
    preflight.ts
    seed.ts
    simulate.ts
    validate-config.ts
  docs/
    runbooks/
    operations/
  railway.toml
  ecosystem.config.cjs
  pnpm-workspace.yaml
```

## 5. Product modes
### 5.1 Operating modes
- `paper`: default; full simulation with realistic fills, slippage, latency, partials, and reconciliation schema identical to live.
- `live`: only enabled after paper validation and explicit operator confirmations.

### 5.2 Product plans
- Private Operator
- Pro Terminal
- Institutional Terminal
- API Client

Plan differences are enforced at the auth, seat, rate-limit, and feature-flag layers; they never alter core risk logic.

## 6. Core domain entities
The implementation must include typed definitions for at least the following entities as first-class shared interfaces:
- Tenant
- User
- Role
- VenueConnector
- NormalizedMarket
- OrderbookSnapshot
- FeatureSnapshot
- MarketDossier
- ModelEstimate
- EnsembleResult
- TradeProposal
- RiskDecision
- OrderIntent
- OrderStateTransition
- Position
- PortfolioState
- PortfolioSnapshot
- DecisionAudit
- CalibrationRecord
- MemoryMatch
- ResearchPack
- AlertEvent
- Playbook
- ApiClient
- UsageMetric

## 7. Venue scope
### 7.1 Launch venues
- Polymarket
- Kalshi

### 7.2 Future venue path
The codebase must support new venues through a strict `VenueConnector` interface. Additional venues may be added later, but launch acceptance criteria cover only Polymarket and Kalshi.

### 7.3 Canonical venue interface
```ts
export interface VenueConnector {
  id: 'polymarket' | 'kalshi' | string;
  fetchMarkets(): Promise<NormalizedMarket[]>;
  fetchOrderbook(marketId: string): Promise<OrderbookSnapshot>;
  placeOrder(order: NewOrder): Promise<VenueOrderResult>;
  cancelOrder(orderId: string): Promise<VenueCancelResult>;
  fetchPositions(): Promise<Position[]>;
  fetchPortfolio(): Promise<PortfolioState>;
  fetchOrder(orderId: string): Promise<VenueOrderResult | null>;
  subscribeToFills?(callback: (fill: FillEvent) => void): Promise<UnsubscribeFn>;
}
```

## 8. System topology
1. Operator Layer
2. Control Plane
3. Market Scanner and Normalizer
4. Feature Store
5. Research Pipeline
6. Model Registry and Ensemble
7. Portfolio Scoring and Ranking
8. Risk Fortress
9. Execution Layer
10. Reconciliation Loop
11. Audit and Calibration
12. Reporting and Commercial APIs

No module may directly bypass the risk engine or reconciliation guardrails.

## 9. Market scanner and normalizer
### 9.1 Poll cadence
- Active markets: every 15 seconds
- Watchlist overrides: every 5 seconds if configured
- Resolved/closed markets: every 5 minutes until archive complete

### 9.2 Scanner inputs
- Polymarket market metadata
- Polymarket CLOB/orderbook
- Kalshi market metadata and orderbooks
- Operator watchlists

### 9.3 NormalizedMarket shape
Required fields:
- `id`
- `source`
- `externalId`
- `slug`
- `question`
- `resolutionCriteria`
- `resolutionDate`
- `status`
- `bestBid`
- `bestAsk`
- `spread`
- `spreadBps`
- `midpoint`
- `lastTradePrice`
- `bidDepth1Pct`
- `askDepth1Pct`
- `bidDepth5Pct`
- `askDepth5Pct`
- `totalLiquidity`
- `volume24h`
- `volume7d`
- `openInterest`
- `tradeCount24h`
- `dataFreshnessMs`
- `isLiquid`
- `hasAmbiguousResolution`
- `category`
- `tags`
- `scannedAt`
- `featureSnapshot`

### 9.4 Hard scanner rejection gates
Reject before research if any condition is true:
- spread > 3%
- totalLiquidity < 500 USD
- dataFreshnessMs > 30,000
- resolutionDate < now + 2 hours
- status != active
- ambiguous resolution and strict mode enabled
- volume24h < 200 USD
- bestBid <= 0
- bestAsk <= 0
- bestBid >= bestAsk
- midpoint <= 0.02 or midpoint >= 0.98

### 9.5 Soft warnings
Log but continue:
- volume24h < 1000 USD
- spread > 1.5%
- resolutionDate < now + 24 hours
- bidDepth1Pct < 100 USD

### 9.6 Resolution parser
A dedicated parser must assign a `resolutionAmbiguityScore` from 0.0 to 1.0 using both rules and LLM-assisted classification. Default block threshold: 0.40.

## 10. Feature store
### 10.1 Purpose
Provide standardized, reusable, time-windowed market features for all model families and future ML training.

### 10.2 Storage pattern
- Redis for hot feature snapshots
- SQL time-series tables for historical windows

### 10.3 Required windows
- 1 minute
- 5 minutes
- 1 hour
- 1 day

### 10.4 Required features
- volatility
- momentum
- spread regime
- order-flow imbalance
- volume burst score
- sentiment velocity
- cross-market correlation score
- catalyst proximity
- macro regime label

## 11. Research pipeline
### 11.1 Output
A `MarketDossier` must be produced for every researched market.

### 11.2 Required stages
1. Resolution Parser
2. Web Research
3. Base Rate Calculator
4. Sentiment Analyzer
5. Microstructure Analyzer
6. Catalyst Forecaster
7. Memory Matcher
8. Deep Reasoner

### 11.3 Optional stage
9. Scenario Tree Generator for high-conviction/high-materiality markets

### 11.4 Execution rules
- Each stage has typed output and typed failure state.
- Total dossier generation target: under 45 seconds.
- Partial failures are allowed; excessive failures force skip.
- Facts require source attribution.
- Contradictions must be explicitly captured.

### 11.5 Required dossier fields
- `marketId`
- `generatedAt`
- `freshnessExpiresAt`
- `resolutionCriteria`
- `resolutionClarified`
- `resolutionAmbiguityScore`
- `keyResolutionRisks`
- `currentFacts`
- `contradictions`
- `informationAge`
- `sourceCount`
- `sourceQuality`
- `baseRate`
- `keyDrivers`
- `catalysts`
- `sentimentSignal`
- `microstructureSignal`
- `probabilityEstimate`
- `probabilityLow`
- `probabilityHigh`
- `confidence`
- `evidenceStrength`
- `contraryCase`
- `steelmanRebuttal`
- `identifiedBlindSpots`
- `marketMemoryMatches`
- `stagesCompleted`
- `stageFailures`
- `skipRecommended`
- `skipReason`

## 12. Provider chain
### 12.1 Supported providers
- OpenAI
- Anthropic
- Groq
- Ollama local fallback

### 12.2 Rules
- JSON or structured outputs only
- hard timeout per request
- retry once on parse failure
- circuit breaker after 3 consecutive failures
- fallback to next provider when breaker is open
- raw unparseable text is always a stage failure

## 13. Model registry
### 13.1 Launch models
1. base_rate
2. llm_research
3. sentiment
4. microstructure
5. historical_analog
6. deep_reasoner
7. relative_value
8. basket_tilt
9. quant_model

### 13.2 Excluded from v2 canonical launch
- Reinforcement-learning live policy control
- Cross-asset brokerage integrations outside prediction markets
- Kubernetes-native production as the default deployment path

These may be future extensions but are not required for v2 acceptance.

### 13.3 Model output requirements
Each model returns:
- modelId
- probability
- confidenceWeight
- evidence
- freshnessScore
- failureReason when applicable

## 14. Ensemble engine
### 14.1 Availability rule
At least 3 models must succeed or the market is skipped.

### 14.2 Outlier rule
Any estimate more than 20 percentage points from the median is downweighted to 25% of its normal effective weight.

### 14.3 Aggregation
Use confidence-weighted mean with freshness adjustment and category calibration adjustment.

### 14.4 Uncertainty
Calculate weighted standard deviation across model outputs.

### 14.5 Disagreement gate
If coefficient of variation exceeds 0.15, block trade recommendation.

### 14.6 Output fields
- ensembleProbability
- ensembleUncertainty
- ensembleConfidence
- modelEstimates
- outlierModels
- calibrationAdjustment
- disagreementScore
- recommendTrade
- skipReason

## 15. Edge calculator and ranking
### 15.1 Edge formulas
```ts
yesEdge = ensembleProbability - bestAsk;
noEdge = (1 - ensembleProbability) - (1 - bestBid);
bestEdge = Math.max(yesEdge, noEdge);
executionCost = spread / 2;
adjustedEdge = bestEdge - executionCost;
penalizedEdge = adjustedEdge * (1 - ensembleUncertainty);
```

### 15.2 Sizing basis
Fractional Kelly capped by mandate, exposure, liquidity, and order-level limits.

### 15.3 Opportunity score
Canonical formula:
```ts
score =
  penalizedEdge * 0.40 +
  ensembleConfidence * 0.25 +
  liquidityScore * 0.15 +
  (1 / daysToResolution) * 0.10 +
  (1 - ensembleUncertainty) * 0.10;
```

## 16. Risk Fortress
### 16.1 Architecture
The risk manager is a pure function. It cannot perform side effects and cannot be bypassed.

### 16.2 Canonical mandates
- ultra_conservative
- conservative
- balanced
- aggressive

### 16.3 Default mandates
```ts
export const MANDATES = {
  ultra_conservative: {
    minEdge: 0.08,
    minConfidence: 0.75,
    fractionalKelly: 0.15,
    maxSingleMarketExposure: 0.02,
    maxCategoryExposure: 0.06,
    maxTotalExposure: 0.15,
  },
  conservative: {
    minEdge: 0.06,
    minConfidence: 0.70,
    fractionalKelly: 0.25,
    maxSingleMarketExposure: 0.03,
    maxCategoryExposure: 0.08,
    maxTotalExposure: 0.20,
  },
  balanced: {
    minEdge: 0.05,
    minConfidence: 0.67,
    fractionalKelly: 0.35,
    maxSingleMarketExposure: 0.05,
    maxCategoryExposure: 0.12,
    maxTotalExposure: 0.28,
  },
  aggressive: {
    minEdge: 0.04,
    minConfidence: 0.65,
    fractionalKelly: 0.45,
    maxSingleMarketExposure: 0.07,
    maxCategoryExposure: 0.16,
    maxTotalExposure: 0.35,
  },
} as const;
```

### 16.4 Canonical risk gates
Exactly 16 gates, in this order:
1. reconciliationGate
2. modeAuthorizationGate
3. killSwitchGate
4. dailyLossGate
5. drawdownBrakeGate
6. totalExposureGate
7. categoryExposureGate
8. singleMarketExposureGate
9. openOrderCountGate
10. minEdgeGate
11. minConfidenceGate
12. spreadGate
13. liquidityParticipationGate
14. deepAnomalyGate
15. orderSizeSanityGate
16. mandateSpecificGate

### 16.5 Cooling periods
- daily loss breach: 4 hours
- drawdown brake: 24 hours
- severe reconciliation mismatch: indefinite until manual acknowledgment
- 3 consecutive blocks for the same reason: 1 hour

## 17. Execution layer
### 17.1 Paper engine
Must simulate:
- execution at bid/ask, not midpoint
- slippage on orders exceeding depth thresholds
- partial fills
- artificial latency
- rejection simulation
- half-spread transaction cost impact

### 17.2 Live execution rules
- limit orders only
- persist exchange order ID before state mutation to accepted/post-submission states
- all state changes acknowledged and logged
- unconfirmed cancels retried up to 3 times, then trigger reconciliation mismatch

### 17.3 Order lifecycle
Canonical order states:
- INTENT_CREATED
- ORDER_VALIDATED
- ORDER_SIGNED
- ORDER_POSTED
- ACCEPTED_BY_CLOB
- PARTIALLY_FILLED
- FILLED
- CANCEL_REQUESTED
- CANCEL_CONFIRMED
- EXPIRED
- REJECTED
- RECONCILIATION_MISMATCH

## 18. Cross-venue logic
### 18.1 Relative value support
The platform must compare equivalent or structurally related markets across Polymarket and Kalshi.

### 18.2 Arbitrage handling
Cross-venue opportunities may be identified and proposed, but launch scope supports only best-effort paired execution with hedge-preservation logic. The system must not claim atomic settlement across venues.

## 19. Reconciliation
### 19.1 Cadence
Run every 30 seconds while trading is active.

### 19.2 Checked entities
- open orders
- fills
- positions
- cash balances
- portfolio exposure calculations

### 19.3 Severity classes
- minor
- moderate
- severe

### 19.4 Severe behavior
- block all new orders immediately
- emit critical alert
- require manual acknowledgment before resuming
- write full mismatch report to audit log

## 20. Audit system
### 20.1 Rule
Every evaluated market creates exactly one decision audit record.

### 20.2 Audit must capture
- scanner data
- dossier summary
- model estimates
- ensemble output
- edge calculations
- deep-reasoning fields
- risk decision
- opportunity score and rank
- final trade/skip outcome
- post-resolution calibration fields when available

### 20.3 Mutability
Audit records are append-only except approved calibration backfill fields.

## 21. Calibration and memory
### 21.1 Calibration cycle
- on resolution of each market
- weekly aggregate reports

### 21.2 Required metrics
- Brier score
- directional accuracy
- calibration curve bins
- sharpness
- per-model recommendations

### 21.3 Memory system
Embed resolved market question plus resolution criteria and return top-K analogs during research.

## 22. Operator terminal
### 22.1 Required pages
1. Mission Control
2. Opportunity Feed
3. Portfolio
4. Performance and Calibration
5. Audit Explorer
6. Configuration
7. Playbooks
8. System Health
9. Research Packs

### 22.2 Required role model
- Owner
- Trader
- Risk
- Compliance
- Viewer
- API-only

### 22.3 Required terminal capabilities
- real-time status and metrics
- paper/live mode indicator
- emergency stop
- kill switch controls
- opportunity filtering
- order and position tables
- equity curve
- exposure views
- calibration charts
- searchable audits
- config editor with validation
- role-aware permissions
- export to CSV for audit and performance data
- research pack export

## 23. Alerts
### 23.1 Severities
- critical
- warning
- info

### 23.2 Channels
- in-app
- email
- webhook
- SMS for critical only

### 23.3 Critical events
- severe reconciliation mismatch
- drawdown brake activated
- daily loss limit hit
- live order failure
- exchange connectivity loss

## 24. Database schema
The canonical SQL/Drizzle schema must include at minimum:
- markets
- market_features
- dossiers
- decision_audits
- orders
- order_state_transitions
- positions
- portfolio_snapshots
- calibration_records
- market_memory
- system_events
- tenants
- users
- tenant_users
- api_clients
- api_keys
- playbooks
- usage_metrics
- config_overrides

## 25. Configuration system
### 25.1 Precedence
1. code defaults
2. environment variables
3. database runtime config
4. session overrides

### 25.2 Rule
All runtime changes must be audited with actor, timestamp, old value, and new value.

## 26. API and monetization
### 26.1 Public product APIs
- `/signals`
- `/dossiers`
- `/performance`
- `/research-packs`

### 26.2 Controls
- scoped API keys
- per-client rate limits
- usage metering
- tenant entitlements

## 27. Security
Required controls:
- encrypted credentials at rest
- no credential logging
- JWT/session auth with RBAC
- dual confirmation for live activation
- Zod validation on all inputs
- parameterized DB access only
- append-only audit patterns
- sanitized client-visible errors

## 28. Deployment
### 28.1 Railway primary
Must include `railway.toml` and deployment instructions.

### 28.2 Self-hosted path
Must include:
- PM2 process file
- systemd service examples
- Nginx reverse proxy config

### 28.3 Explicit exclusions
The canonical production documentation must not require Docker or Docker Compose.

## 29. Testing
### 29.1 Required suites
- unit tests for all 16 risk gates
- ensemble tests
- paper execution tests
- reconciliation tests
- order lifecycle tests
- integration tests for scanner-to-audit pipeline

### 29.2 Simulation
`pnpm simulate` must run replay testing and emit:
- win rate
- average edge
- Brier score
- Sharpe-like metric if calculable
- drawdown metrics

## 30. Implementation phases
### Phase 1
Core types, config, DB schema, risk fortress, paper engine, reconciliation, preflight.

### Phase 2
Scanner, normalizer, feature store, market registry persistence.

### Phase 3
Research pipeline, provider chain, model registry, ensemble, edge calculator.

### Phase 4
Polymarket and Kalshi adapters, live order lifecycle, reconciliation hardening.

### Phase 5
Operator terminal, auth, roles, alerts, exports.

### Phase 6
Calibration, memory, commercial APIs, playbooks, performance reporting.

### Phase 7
Simulation, paper validation, security review, performance tuning, operations docs.

## 31. Acceptance criteria
The system is accepted when all are true:
- preflight passes
- TypeScript build passes
- all critical tests pass
- all 16 risk gates have explicit tests
- 72 consecutive hours of paper trading complete with zero severe reconciliation mismatches
- every trade decision has a complete audit record
- live mode requires explicit operator confirmation workflow
- kill switch halts new live orders immediately
- reconciliation executes every 30 seconds during active sessions
- dossier generation completes within 45 seconds for normal markets
- at least one non-UI alert channel is verified operational
- no credentials appear in logs
- production docs support Railway and PM2/systemd/Nginx without Docker

## 32. Explicit non-goals for v2
These are intentionally excluded from the canonical build and must not delay delivery:
- guaranteeing any fixed win rate
- RL-driven autonomous live control as a release requirement
- non-prediction-market brokerage integrations as a launch requirement
- Kubernetes-first deployment as a launch requirement
- social-media vanity features unrelated to edge, risk, execution, or operator control

## 33. Final instruction to the engineering team
Build exactly to this specification as the canonical source of truth. If any earlier draft conflicts with this document, this document wins.
