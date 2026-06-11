import { loadConfig } from '@polyshore/config';
import { CalibrationRecordRepository, ConfigOverrideRepository, createDb, MarketRepository, PerformanceRepository, PortfolioRepository, WorkerHealthRepository } from '@polyshore/db';
import { PolymarketConnector, KalshiConnector } from '@polyshore/venues';
import { applyOrderbookSnapshot, evaluateScannerGates } from '@polyshore/scanner';
import { logInfo } from '@polyshore/observability';
import { createResearchStagesFromConfig } from '@polyshore/research';
import { evaluateMarketPipeline } from './pipeline';

const config = loadConfig();
const tenantId = process.env.TENANT_ID ?? 'system';
const db = createDb(config.DATABASE_URL);
const marketRepository = new MarketRepository(db);
const portfolioRepository = new PortfolioRepository(db);
const safetyRepository = new ConfigOverrideRepository(db);
const performanceRepo = new PerformanceRepository(db);
const calibrationRepo = new CalibrationRecordRepository(db);
const health = new WorkerHealthRepository(db);
const researchStages = createResearchStagesFromConfig(config);
const connectors = [
  new PolymarketConnector(config.POLYMARKET_GAMMA_URL, config.POLYMARKET_CLOB_URL, 'system'),
  ...(config.KALSHI_KEY_ID && config.KALSHI_PRIVATE_KEY
    ? [new KalshiConnector(config.KALSHI_API_URL, config.KALSHI_KEY_ID, config.KALSHI_PRIVATE_KEY, 'system')]
    : [])
];

async function scanOnce() {
  const safety = await safetyRepository.readSafetyState(tenantId);
  const [modelPerformanceRecords, calibrationData] = await Promise.all([
    performanceRepo.getModelPerformanceRecords(tenantId, 200),
    calibrationRepo.getRecentResolved(50)
  ]);
  let totalFetched = 0;
  let totalAccepted = 0;
  for (const connector of connectors) {
    const markets = await connector.fetchMarkets();
    let accepted = 0;
    for (const rawMarket of markets) {
      // Pre-check on raw data before making expensive per-market orderbook call
      const preCheck = evaluateScannerGates(rawMarket, new Date(), config.STRICT_RESOLUTION_MODE);
      if (!preCheck.accepted) continue;
      const book = await connector.fetchOrderbook(rawMarket.id);
      const market = applyOrderbookSnapshot(rawMarket, book);
      const decision = evaluateScannerGates(market, new Date(), config.STRICT_RESOLUTION_MODE);
      if (!decision.accepted) continue;
      await marketRepository.upsertMarket(market);
      const portfolio = await portfolioRepository.latest(tenantId);
      if (portfolio) {
        await evaluateMarketPipeline(db, market, {
          tenantId,
          mode: config.OPERATING_MODE,
          mandateId: config.MANDATE_ID,
          portfolio,
          liveAuthorized: safety.liveAuthorized,
          killSwitchActive: safety.killSwitchActive,
          dailyLossLimit: config.DAILY_LOSS_LIMIT,
          drawdownLimit: config.DRAWDOWN_LIMIT,
          maxOpenOrders: config.MAX_OPEN_ORDERS,
          maxParticipationRate: config.MAX_PARTICIPATION_RATE,
          severeAnomaly: false,
          capturedOrderbook: book,
          liveActivationConfirmedAt: safety.liveActivationConfirmedAt,
          researchStages,
          modelPerformanceRecords,
          calibrationData
        });
      }
      accepted += 1;
    }
    logInfo('scanner cycle persisted', { venue: connector.id, fetched: markets.length, accepted });
    totalFetched += markets.length;
    totalAccepted += accepted;
  }
  await health.heartbeat({ worker: 'scanner-worker', status: 'ok', lastHeartbeatAt: new Date(), lastSuccessAt: new Date(), metadata: { fetched: totalFetched, accepted: totalAccepted } });
}

if (process.env.WORKER_ONCE === 'true') {
  await scanOnce();
  logInfo('scanner worker one-shot complete', { mode: config.OPERATING_MODE });
} else {
  await loop('scanner-worker', scanOnce);
}

async function loop(worker: string, run: () => Promise<void>) {
  let backoffMs = 1_000;
  for (;;) {
    try {
      await run();
      backoffMs = 1_000;
      await sleep(config.ACTIVE_MARKET_POLL_SECONDS * 1000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await health.heartbeat({ worker, status: 'error', lastHeartbeatAt: new Date(), lastError: message });
      logInfo(`${worker} cycle failed`, { error: message, backoffMs });
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 60_000);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
