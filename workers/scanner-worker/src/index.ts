import { loadConfig } from '@polyshore/config';
import { PolymarketConnector, KalshiConnector } from '@polyshore/venues';
import { evaluateScannerGates } from '@polyshore/scanner';
import { logInfo } from '@polyshore/observability';

const config = loadConfig();
const connectors = [
  new PolymarketConnector(config.POLYMARKET_GAMMA_URL, config.POLYMARKET_CLOB_URL, 'system'),
  new KalshiConnector(config.KALSHI_API_URL, config.KALSHI_KEY_ID, config.KALSHI_PRIVATE_KEY, 'system')
];

for (const connector of connectors) {
  const markets = await connector.fetchMarkets();
  const accepted = markets.filter((market) => evaluateScannerGates(market, new Date(), config.STRICT_RESOLUTION_MODE).accepted);
  logInfo('scanner cycle complete', { venue: connector.id, fetched: markets.length, accepted: accepted.length });
}
