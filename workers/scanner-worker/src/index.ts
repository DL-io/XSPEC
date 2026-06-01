import { loadConfig } from '@polyshore/config';
import { createDb, MarketRepository } from '@polyshore/db';
import { PolymarketConnector, KalshiConnector } from '@polyshore/venues';
import { applyOrderbookSnapshot, evaluateScannerGates } from '@polyshore/scanner';
import { logInfo } from '@polyshore/observability';

const config = loadConfig();
const marketRepository = new MarketRepository(createDb(config.DATABASE_URL));
const connectors = [
  new PolymarketConnector(config.POLYMARKET_GAMMA_URL, config.POLYMARKET_CLOB_URL, 'system'),
  new KalshiConnector(config.KALSHI_API_URL, config.KALSHI_KEY_ID, config.KALSHI_PRIVATE_KEY, 'system')
];

async function scanOnce() {
  for (const connector of connectors) {
    const markets = await connector.fetchMarkets();
    let accepted = 0;
    for (const rawMarket of markets) {
      const book = await connector.fetchOrderbook(rawMarket.id);
      const market = applyOrderbookSnapshot(rawMarket, book);
      const decision = evaluateScannerGates(market, new Date(), config.STRICT_RESOLUTION_MODE);
      if (!decision.accepted) continue;
      await marketRepository.upsertMarket(market);
      accepted += 1;
    }
    logInfo('scanner cycle persisted', { venue: connector.id, fetched: markets.length, accepted });
  }
}

await scanOnce();
setInterval(() => {
  scanOnce().catch((error) => logInfo('scanner cycle failed', { error: error instanceof Error ? error.message : String(error) }));
}, config.ACTIVE_MARKET_POLL_SECONDS * 1000);
