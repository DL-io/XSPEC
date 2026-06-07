import { ReconciliationQuerySchema, ReconciliationUpdateSchema } from '@polyshore/api';
import { PortfolioRepository, ReconciliationIncidentRepository } from '@polyshore/db';
import { authError, getDb, requireApiAccess } from '../_server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = ReconciliationQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!query.success) return Response.json({ error: 'invalid reconciliation query', issues: query.error.issues }, { status: 400 });
    await requireApiAccess(request, { tenantId: query.data.tenantId, permission: 'read', apiScope: 'api:read' });
    const db = getDb();
    const state = await new ReconciliationIncidentRepository(db).state(query.data.tenantId);
    return Response.json({ state });
  } catch (error) {
    return authError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const parsed = ReconciliationUpdateSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'invalid reconciliation update', issues: parsed.error.issues }, { status: 400 });
    const actor = await requireApiAccess(request, { tenantId: parsed.data.tenantId, permission: 'risk:manage' });

    const db = getDb();
    const incidents = new ReconciliationIncidentRepository(db);
    const portfolio = new PortfolioRepository(db);
    const state = parsed.data.action === 'acknowledge'
      ? await incidents.acknowledge({ tenantId: parsed.data.tenantId, actorId: actor.actorId, reason: parsed.data.reason })
      : await incidents.clear(parsed.data.tenantId, parsed.data.reason, actor.actorId);
    await portfolio.markSevereMismatch(parsed.data.tenantId, state.severeMismatchOpen);
    return Response.json({ state });
  } catch (error) {
    return authError(error);
  }
}
