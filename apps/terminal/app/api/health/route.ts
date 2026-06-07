import { loadConfig } from '@polyshore/config';
import { WorkerHealthRepository } from '@polyshore/db';
import { checkRedisHealth } from '@polyshore/observability';
import { authError, getDb, requireApiAccess } from '../_server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get('tenantId');
    if (!tenantId) return Response.json({ status: 'ok' });
    await requireApiAccess(request, { tenantId, permission: 'read', apiScope: 'api:read' });
    const config = loadConfig();
    const [workers, redis] = await Promise.all([
      new WorkerHealthRepository(getDb()).latest(),
      checkRedisHealth(config.REDIS_URL)
    ]);
    return Response.json({ workers, dependencies: [redis] });
  } catch (error) {
    return authError(error);
  }
}
