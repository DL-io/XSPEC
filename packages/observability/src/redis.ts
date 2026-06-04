import { createClient } from 'redis';

export interface DependencyHealthRecord {
  name: string;
  status: 'ok' | 'error';
  latencyMs?: number;
  checkedAt: Date;
  error?: string;
}

export interface RedisHealthClient {
  connect(): Promise<unknown>;
  ping(): Promise<unknown>;
  quit(): Promise<unknown>;
  disconnect?(): Promise<unknown> | unknown;
}

export type RedisClientFactory = (url: string, timeoutMs: number) => RedisHealthClient;

export async function checkRedisHealth(redisUrl: string, timeoutMs = 2_000, factory: RedisClientFactory = defaultRedisClientFactory): Promise<DependencyHealthRecord> {
  const startedAt = Date.now();
  const client = factory(redisUrl, timeoutMs);
  try {
    await withTimeout(client.connect(), timeoutMs, 'Redis connection timed out');
    await withTimeout(client.ping(), timeoutMs, 'Redis ping timed out');
    await withTimeout(client.quit(), timeoutMs, 'Redis quit timed out');
    return { name: 'redis', status: 'ok', latencyMs: Date.now() - startedAt, checkedAt: new Date() };
  } catch (error) {
    await closeRedisClient(client);
    return {
      name: 'redis',
      status: 'error',
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function defaultRedisClientFactory(url: string, timeoutMs: number): RedisHealthClient {
  return createClient({ url, socket: { connectTimeout: timeoutMs } });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function closeRedisClient(client: RedisHealthClient): Promise<void> {
  try {
    if (client.disconnect) await client.disconnect();
  } catch {
    // Best effort cleanup after a failed health check.
  }
}
