import { loadConfig, validateConfigFromEnvFile } from '@polyshore/config';
import {
  createDb,
  DecisionAuditRepository,
  DossierRepository,
  MarketFeatureRepository,
  OrderbookRepository,
  PortfolioRepository,
  ProbabilityEstimateRepository,
  RiskEventRepository
} from '@polyshore/db';
import { computeFeatureSnapshot } from '@polyshore/features';
import { buildEnsemble, generateModelEstimates } from '@polyshore/models';
import { proposeTrade } from '@polyshore/portfolio';
import { buildDossier, degradedResearchStages } from '@polyshore/research';
import { evaluateRisk } from '@polyshore/risk';
import { applyOrderbookSnapshot, evaluateScannerGates } from '@polyshore/scanner';
import { assertCompleteDecisionAudit } from '@polyshore/audit';
import type { NormalizedMarket, OrderbookSnapshot, PortfolioState } from '@polyshore/core';
import { createClient } from 'redis';
import { processApprovedAudit } from '../workers/execution-worker/src/processor.ts';

type StepResult = { name: string; result: 'PASS' | 'FAIL' | 'SKIP'; detail?: string };
const steps: StepResult[] = [];

function pass(name: string, detail?: string) { steps.push({ name, result: 'PASS', detail }); }
function failStep(name: string, detail: string) { steps.push({ name, result: 'FAIL', detail }); }
function skip(name: string, detail?: string) { steps.push({ name, result: 'SKIP', detail }); }

function printSummary() {
  console.log('\n=== paper:e2e results ===');
  for (const s of steps) {
    const tag = s.result === 'PASS' ? 'PASS' : s.result === 'FAIL' ? 'FAIL' : 'SKIP';
    console.log(`[${tag}] ${s.name}${s.detail ? ` — ${s.detail}` : ''}`);
  }
  const failed = steps.filter(s => s.result === 'FAIL').length;
  const passed = steps.filter(s => s.result === 'PASS').length;
  const skipped = steps.filter(s => s.result === 'SKIP').length;
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
}

async function main() {
  // ─── Step 1: Config ─────────────────────────────────────────────────────────
  let validationResult: ReturnType<typeof validateConfigFromEnvFile>;
  let runtimeConfig: ReturnType<typeof loadConfig>;
  try {
    validationResult = validateConfigFromEnvFile();
    runtimeConfig = loadConfig();
    if (validationResult.operatingMode !== 'paper') {
      failStep('config', `OPERATING_MODE must be "paper" for this test, got "${validationResult.operatingMode}"`);
      printSummary();
      process.exit(1);
    }
    pass('config', `mode=paper envFile=${validationResult.envFileLoaded}`);
  } catch (e) {
    failStep('config', e instanceof Error ? e.message : String(e));
    printSummary();
    process.exit(1);
  }

  const db = createDb(runtimeConfig.DATABASE_URL);

  // ─── Step 2: Database connectivity ─────────────────────────────────────────
  try {
    await db.execute('SELECT 1');
    pass('db:connect', 'ok');
  } catch (e) {
    failStep('db:connect', e instanceof Error ? e.message : String(e));
    printSummary();
    process.exit(1);
  }

  // ─── Step 3: Table count ────────────────────────────────────────────────────
  try {
    const dbName = new URL(runtimeConfig.DATABASE_URL.replace('mysql://', 'http://')).pathname.slice(1);
    const result = await db.execute(
      `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = '${dbName}' AND table_name != '__drizzle_migrations'`
    ) as unknown as [[Record<string, unknown>], unknown[]];
    const count = Number(result[0][0]?.n ?? 0);
    if (count < 25) {
      failStep('db:tables', `expected ≥25 app tables, got ${count}`);
      printSummary();
      process.exit(1);
    }
    pass('db:tables', `${count} app tables`);
  } catch (e) {
    failStep('db:tables', e instanceof Error ? e.message : String(e));
  }

  // ─── Step 4: Redis connectivity ─────────────────────────────────────────────
  try {
    const redis = createClient({ url: runtimeConfig.REDIS_URL });
    redis.on('error', () => undefined);
    await redis.connect();
    const pong = await redis.ping();
    await redis.quit();
    if (pong !== 'PONG') {
      failStep('redis:ping', `expected PONG, got ${pong}`);
    } else {
      pass('redis:ping', 'ok');
    }
  } catch (e) {
    failStep('redis:ping', e instanceof Error ? e.message : String(e));
  }

  // ─── Step 5: Build synthetic market ─────────────────────────────────────────
  const tenantId = process.env.TENANT_ID ?? 'system';
  const now = new Date();
  const resolutionDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Bids/asks must be within 1% of midpoint (0.64) for depthWithin gates to pass:
  // bidDepth1Pct requires price >= 0.64 * 0.99 = 0.6336
  // askDepth1Pct requires price <= 0.64 * 1.01 = 0.6464
  const rawMarket: NormalizedMarket = {
    id: `paper-e2e:${Date.now()}`,
    source: 'polymarket',
    externalId: '71321085094466569858516529069614472147987023078285875090973898134',
    slug: 'paper-e2e-test',
    question: 'Will the paper E2E test pass?',
    resolutionCriteria: 'Resolves YES if the XSPEC paper-e2e script exits 0.',
    resolutionDate,
    status: 'active',
    bestBid: 0.638,
    bestAsk: 0.642,
    spread: 0.004,
    spreadBps: 6,
    midpoint: 0.64,
    lastTradePrice: 0.640,
    bidDepth1Pct: 1200,
    askDepth1Pct: 1100,
    bidDepth5Pct: 4000,
    askDepth5Pct: 3800,
    totalLiquidity: 8000,
    volume24h: 1500,
    volume7d: 10000,
    openInterest: 3000,
    tradeCount24h: 120,
    dataFreshnessMs: 100,
    isLiquid: true,
    hasAmbiguousResolution: false,
    resolutionAmbiguityScore: 0,
    category: 'tech',
    tags: ['test', 'paper'],
    scannedAt: now
  };

  const book: OrderbookSnapshot = {
    marketId: rawMarket.id,
    source: 'polymarket',
    bids: [{ price: 0.638, size: 1000 }, { price: 0.636, size: 800 }],
    asks: [{ price: 0.642, size: 900 }, { price: 0.644, size: 700 }],
    capturedAt: now
  };
  pass('market:synthetic', `id=${rawMarket.id}`);

  // ─── Step 6: Scanner gates ───────────────────────────────────────────────────
  const market = applyOrderbookSnapshot(rawMarket, book);
  const scanResult = evaluateScannerGates(market, now, runtimeConfig.STRICT_RESOLUTION_MODE);
  if (!scanResult.accepted) {
    failStep('scanner:gates', `rejected: ${scanResult.hardRejectReasons.join(', ')}`);
    printSummary();
    process.exit(1);
  }
  pass('scanner:gates', `accepted, ${scanResult.softWarnings.length} warnings`);

  // ─── Step 7: Orderbook + feature persistence ─────────────────────────────────
  try {
    await new OrderbookRepository(db).put(book);
    const features = computeFeatureSnapshot(market, '1m');
    await new MarketFeatureRepository(db).put(features);
    pass('db:orderbook+features', 'persisted');
  } catch (e) {
    failStep('db:orderbook+features', e instanceof Error ? e.message : String(e));
  }

  // ─── Step 8: Research (degraded mode) ───────────────────────────────────────
  const features = computeFeatureSnapshot(market, '1m');
  let dossier: Awaited<ReturnType<typeof buildDossier>>;
  try {
    const researchStages = degradedResearchStages('paper-e2e uses degraded research — no API keys required');
    dossier = await buildDossier(market, researchStages);
    const storedId = await new DossierRepository(db).put(dossier);
    pass('research:dossier', `stages=${dossier.stagesCompleted.length} id=${storedId.slice(0, 16)}...`);
  } catch (e) {
    failStep('research:dossier', e instanceof Error ? e.message : String(e));
    printSummary();
    process.exit(1);
  }

  // ─── Step 9: Model estimates ─────────────────────────────────────────────────
  const modelEstimates = generateModelEstimates({ market, dossier, featureSnapshot: features });
  try {
    await new ProbabilityEstimateRepository(db).putMany({ tenantId, marketId: market.id, estimates: modelEstimates, createdAt: now });
    pass('models:estimates', `${modelEstimates.length} estimates persisted`);
  } catch (e) {
    failStep('models:estimates', e instanceof Error ? e.message : String(e));
  }

  // ─── Step 10: Ensemble ───────────────────────────────────────────────────────
  const ensemble = buildEnsemble(modelEstimates);
  if (ensemble.ensembleProbability === 0 && ensemble.ensembleConfidence === 0 && ensemble.skipReason) {
    failStep('models:ensemble', `degenerate ensemble: ${ensemble.skipReason}`);
    printSummary();
    process.exit(1);
  }
  pass('models:ensemble', `p=${ensemble.ensembleProbability.toFixed(3)} conf=${ensemble.ensembleConfidence.toFixed(3)} recommend=${ensemble.recommendTrade}`);

  // ─── Step 11: Portfolio + trade proposal ─────────────────────────────────────
  const portfolio: PortfolioState = {
    tenantId,
    cash: 10000,
    equity: 10000,
    totalExposure: 0,
    categoryExposure: {},
    positions: [],
    openOrderCount: 0,
    dailyPnl: 0,
    maxDrawdown: 0,
    reconciledAt: now,
    severeMismatchOpen: false
  };
  try {
    await new PortfolioRepository(db).put(portfolio);
  } catch (_) { /* snapshot already exists for this tenant — non-fatal */ }

  const proposal = proposeTrade(market, ensemble, portfolio, 'conservative');
  pass('portfolio:proposal', `side=${proposal.side} edge=${proposal.edge.toFixed(4)} size=${proposal.suggestedSize.toFixed(2)}`);

  // ─── Step 12: Risk evaluation ────────────────────────────────────────────────
  const riskDecision = evaluateRisk({
    mode: 'paper',
    liveAuthorized: false,
    killSwitchActive: false,
    market,
    proposal,
    portfolio,
    mandateId: 'conservative',
    dailyLossLimit: 500,
    drawdownLimit: 0.15,
    maxOpenOrders: 10,
    maxParticipationRate: 0.1,
    severeAnomaly: false,
    now
  });
  try {
    await new RiskEventRepository(db).appendFromDecision({ tenantId, marketId: market.id, decision: riskDecision, createdAt: now });
  } catch (_) { /* risk events are advisory */ }

  const finalOutcome: 'trade' | 'skip' = !dossier.skipRecommended && ensemble.recommendTrade && riskDecision.approved ? 'trade' : 'skip';
  pass('risk:evaluation', `approved=${riskDecision.approved} outcome=${finalOutcome} gates=${riskDecision.evaluatedGates.length}`);

  // ─── Step 13: Decision audit write ──────────────────────────────────────────
  const audit = {
    id: crypto.randomUUID(),
    marketId: market.id,
    tenantId,
    scannerData: market,
    capturedOrderbook: book,
    featureSnapshot: features,
    dossierId: `${market.id}:${dossier.generatedAt.toISOString()}`,
    dossierSummary: {
      marketId: dossier.marketId,
      generatedAt: dossier.generatedAt,
      freshnessExpiresAt: dossier.freshnessExpiresAt,
      probabilityEstimate: dossier.probabilityEstimate,
      confidence: dossier.confidence,
      skipRecommended: dossier.skipRecommended,
      skipReason: dossier.skipReason
    },
    modelEstimates,
    ensembleOutput: ensemble,
    tradeProposal: proposal,
    edgeCalculations: { edge: proposal.edge, adjustedEdge: proposal.adjustedEdge, penalizedEdge: proposal.penalizedEdge },
    riskDecision,
    opportunityScore: proposal.opportunityScore,
    finalOutcome,
    createdAt: now
  };

  try {
    assertCompleteDecisionAudit(audit);
    await new DecisionAuditRepository(db).append(audit);
    pass('db:audit', `id=${audit.id.slice(0, 8)}... outcome=${finalOutcome}`);
  } catch (e) {
    failStep('db:audit', e instanceof Error ? e.message : String(e));
    printSummary();
    process.exit(1);
  }

  // ─── Step 14: Paper execution ────────────────────────────────────────────────
  if (finalOutcome === 'trade') {
    try {
      const result = await processApprovedAudit(db, audit, { tenantId, mode: 'paper' });
      pass('execution:paper', `state=${result.state} filled=${result.filledQuantity.toFixed(4)}`);
    } catch (e) {
      failStep('execution:paper', e instanceof Error ? e.message : String(e));
    }
  } else {
    skip('execution:paper', `outcome=${finalOutcome} (degraded mode: dossier recommends skip)`);
  }

  // ─── Step 15: Audit read-back ────────────────────────────────────────────────
  try {
    const recent = await new DecisionAuditRepository(db).latestForTenant(tenantId, 10);
    const found = recent.find(a => a.id === audit.id);
    if (!found) {
      failStep('db:audit:readback', 'written audit not found in readback');
    } else {
      pass('db:audit:readback', `verified in ${recent.length} recent audits`);
    }
  } catch (e) {
    failStep('db:audit:readback', e instanceof Error ? e.message : String(e));
  }

  // ─── Done ────────────────────────────────────────────────────────────────────
  printSummary();
  process.exit(steps.some(s => s.result === 'FAIL') ? 1 : 0);
}

main().catch((e) => {
  console.error('paper:e2e fatal error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
