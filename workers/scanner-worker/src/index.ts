import { loadConfig } from '@polyshore/config';
import { ConfigOverrideRepository, createDb, MarketRepository, PortfolioRepository } from '@polyshore/db';
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
const researchStages = createResearchStagesFromConfig(config);
const connectors = [
  new PolymarketConnector(config.POLYMARKET_GAMMA_URL, config.POLYMARKET_CLOB_URL, 'system'),
  new KalshiConnector(config.KALSHI_API_URL, config.KALSHI_KEY_ID, config.KALSHI_PRIVATE_KEY, 'system')
];

async function scanOnce() {
  const safety = await safetyRepository.readSafetyState(tenantId);
  for (const connector of connectors) {
    const markets = await connector.fetchMarkets();
    let accepted = 0;
    for (const rawMarket of markets) {
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
          mandateId: 'conservative',
          portfolio,
          liveAuthorized: safety.liveAuthorized,
          killSwitchActive: safety.killSwitchActive,
          dailyLossLimit: 500,
          drawdownLimit: 0.1,
          maxOpenOrders: 10,
          maxParticipationRate: 0.1,
          severeAnomaly: false,
          capturedOrderbook: book,
          liveActivationConfirmedAt: safety.liveActivationConfirmedAt,
          researchStages
        });
      }
      accepted += 1;
    }
    logInfo('scanner cycle persisted', { venue: connector.id, fetched: markets.length, accepted });
  }
}

await scanOnce();
setInterval(() => {
  scanOnce().catch((error) => logInfo('scanner cycle failed', { error: error instanceof Error ? error.message : String(error) }));
}, config.ACTIVE_MARKET_POLL_SECONDS * 1000);
