import { describe, expect, it, vi } from 'vitest';
import { checkRedisHealth, type RedisHealthClient } from './redis';

describe('Redis health check', () => {
  it('reports ok after connect, ping, and quit succeed', async () => {
    const client = redisClient();
    const result = await checkRedisHealth('redis://localhost:6379', 50, () => client);

    expect(result.status).toBe('ok');
    expect(result.name).toBe('redis');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.ping).toHaveBeenCalledOnce();
    expect(client.quit).toHaveBeenCalledOnce();
  });

  it('reports error and disconnects when Redis ping fails', async () => {
    const client = redisClient({ ping: vi.fn(async () => { throw new Error('NOAUTH Authentication required'); }) });
    const result = await checkRedisHealth('redis://localhost:6379', 50, () => client);

    expect(result.status).toBe('error');
    expect(result.error).toBe('NOAUTH Authentication required');
    expect(client.disconnect).toHaveBeenCalledOnce();
  });

  it('reports timeout when Redis does not respond', async () => {
    const client = redisClient({ connect: vi.fn(() => new Promise(() => undefined)) });
    const result = await checkRedisHealth('redis://localhost:6379', 5, () => client);

    expect(result.status).toBe('error');
    expect(result.error).toBe('Redis connection timed out');
    expect(client.disconnect).toHaveBeenCalledOnce();
  });
});

function redisClient(overrides: Partial<RedisHealthClient> = {}): RedisHealthClient {
  return {
    connect: vi.fn(async () => 'OK'),
    ping: vi.fn(async () => 'PONG'),
    quit: vi.fn(async () => 'OK'),
    disconnect: vi.fn(async () => undefined),
    ...overrides
  };
}
