import { loadConfig } from '@polyshore/config';
import { WorkerHealthRepository } from '@polyshore/db';
import { checkRedisHealth } from '@polyshore/observability';
import { getDb } from '../_server';

export async function GET() {
  const config = loadConfig();
  const [workers, redis] = await Promise.all([
    new WorkerHealthRepository(getDb()).latest(),
    checkRedisHealth(config.REDIS_URL)
  ]);
  return Response.json({ workers, dependencies: [redis] });
}
