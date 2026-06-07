import { SafetyQuerySchema, SafetyUpdateSchema } from '@polyshore/api';
import { ConfigOverrideRepository, WorkerHealthRepository } from '@polyshore/db';
import { authError, getDb, rateLimitHeaders, requireApiAccess } from '../_server';

const REQUIRED_LIVE_WORKERS = ['scanner-worker', 'execution-worker', 'reconciliation-worker'];

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = SafetyQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!query.success) return Response.json({ error: 'invalid safety query', issues: query.error.issues }, { status: 400 });
    await requireApiAccess(request, { tenantId: query.data.tenantId, permission: 'read', apiScope: 'api:read' });
    const state = await new ConfigOverrideRepository(getDb()).readSafetyState(query.data.tenantId);
    return Response.json({ state });
  } catch (error) {
    return authError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const parsed = SafetyUpdateSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'invalid safety update', issues: parsed.error.issues }, { status: 400 });
    const actor = await requireApiAccess(request, { tenantId: parsed.data.tenantId, permission: 'killswitch:manage' });

    const db = getDb();
    const repository = new ConfigOverrideRepository(db);
    let state = await repository.readSafetyState(parsed.data.tenantId);
    if (parsed.data.liveAuthorization?.enabled) {
      if (state.killSwitchActive || parsed.data.killSwitch?.active) {
        return Response.json({ error: 'Cannot authorize live trading while kill switch is active.' }, { status: 409, headers: rateLimitHeaders(actor.rateLimit) }); // HARDENED: live authorization cannot bypass an active kill switch.
      }
      const missingWorkers = await staleRequiredWorkers(new WorkerHealthRepository(db));
      if (missingWorkers.length) {
        return Response.json({ error: 'Cannot go live: required workers are not running', missingWorkers }, { status: 503, headers: rateLimitHeaders(actor.rateLimit) }); // HARDENED: live authorization requires fresh worker heartbeats.
      }
    }
    if (parsed.data.killSwitch) {
      state = await repository.setKillSwitch({
        tenantId: parsed.data.tenantId,
        active: parsed.data.killSwitch.active,
        reason: parsed.data.killSwitch.reason,
        actorId: actor.actorId
      });
    }
    if (parsed.data.liveAuthorization) {
      state = await repository.setLiveAuthorization({
        tenantId: parsed.data.tenantId,
        enabled: parsed.data.liveAuthorization.enabled,
        reason: parsed.data.liveAuthorization.reason,
        actorId: actor.actorId
      });
    }
    return Response.json({ state }, { headers: rateLimitHeaders(actor.rateLimit) }); // HARDENED: mutation exposes rate-limit budget headers.
  } catch (error) {
    return authError(error);
  }
}

async function staleRequiredWorkers(repository: WorkerHealthRepository): Promise<string[]> {
  const now = Date.now();
  const latest = await repository.latest();
  const byWorker = new Map(latest.map((worker) => [worker.worker, worker]));
  return REQUIRED_LIVE_WORKERS.filter((worker) => {
    const heartbeat = byWorker.get(worker);
    if (!heartbeat) return true;
    return now - new Date(heartbeat.lastHeartbeatAt).getTime() > 120_000;
  });
}
