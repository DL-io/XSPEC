import { SafetyQuerySchema, SafetyUpdateSchema } from '@polyshore/api';
import { ConfigOverrideRepository } from '@polyshore/db';
import { authError, getDb, requireApiAccess } from '../_server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = SafetyQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) return Response.json({ error: 'invalid safety query', issues: query.error.issues }, { status: 400 });
  const state = await new ConfigOverrideRepository(getDb()).readSafetyState(query.data.tenantId);
  return Response.json({ state });
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const parsed = SafetyUpdateSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'invalid safety update', issues: parsed.error.issues }, { status: 400 });
    const actor = await requireApiAccess(request, { tenantId: parsed.data.tenantId, permission: 'killswitch:manage' });

    const repository = new ConfigOverrideRepository(getDb());
    let state = await repository.readSafetyState(parsed.data.tenantId);
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
    return Response.json({ state });
  } catch (error) {
    return authError(error);
  }
}
