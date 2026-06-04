import { constants, createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KalshiConnector, signKalshiRequest } from './index';

describe('KalshiConnector authentication', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signs authenticated portfolio requests without placing orders', async () => {
    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKey = keyPair.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
    const publicKey = createPublicKey(keyPair.privateKey);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const headers = init?.headers as Record<string, string>;
      expect(init?.method ?? 'GET').toBe('GET');
      expect(headers['KALSHI-ACCESS-KEY']).toBe('test-key-id');
      expect(headers['KALSHI-ACCESS-TIMESTAMP']).toMatch(/^\d+$/);
      expect(headers['KALSHI-ACCESS-SIGNATURE']).toBeTruthy();
      const path = new URL(url).pathname;
      const valid = verify('sha256', Buffer.from(`${headers['KALSHI-ACCESS-TIMESTAMP']}GET${path}`), {
        key: publicKey,
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength: constants.RSA_PSS_SALTLEN_DIGEST
      }, Buffer.from(headers['KALSHI-ACCESS-SIGNATURE'], 'base64'));
      expect(valid).toBe(true);
      return jsonResponse(url.endsWith('/portfolio/balance') ? { balance: 12500 } : []);
    });

    const portfolio = await new KalshiConnector('https://example.test/trade-api/v2', 'test-key-id', privateKey, 'tenant-1').fetchPortfolio();

    expect(portfolio.cash).toBe(125);
    expect(portfolio.positions).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/portfolio/orders') || init?.method === 'POST')).toBe(false);
  });

  it('fails authenticated operations clearly when credentials are missing', async () => {
    await expect(new KalshiConnector('https://example.test/trade-api/v2', undefined, undefined, 'tenant-1').fetchPortfolio())
      .rejects.toThrow('Kalshi credentials are required for authenticated operations.');
  });

  it('fails before the network when the private key cannot sign', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(new KalshiConnector('https://example.test/trade-api/v2', 'test-key-id', 'not-a-private-key', 'tenant-1').fetchPortfolio())
      .rejects.toThrow(/Kalshi private key could not sign request/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs only the URL path and excludes query parameters', () => {
    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKey = keyPair.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
    const timestamp = '1703123456789';
    const signature = signKalshiRequest(privateKey, timestamp, 'GET', '/trade-api/v2/portfolio/orders?limit=5');
    const valid = verify('sha256', Buffer.from(`${timestamp}GET/trade-api/v2/portfolio/orders`), {
      key: createPublicKey(keyPair.privateKey),
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST
    }, Buffer.from(signature, 'base64'));

    expect(valid).toBe(true);
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}
