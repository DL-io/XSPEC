import { ReconciliationQuerySchema, ReconciliationUpdateSchema } from '@polyshore/api';
import { PortfolioRepository, ReconciliationIncidentRepository } from '@polyshore/db';
import { authError, getDb, requireApiAccess } from '../_server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = ReconciliationQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) return Response.json({ error: 'invalid reconciliation query', issues: query.error.issues }, { status: 400 });
  const db = getDb();
  const state = await new ReconciliationIncidentRepository(db).state(query.data.tenantId);
  return Response.json({ state });
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
      ? await incidents.acknowledge({ tenantId: parsed.data.tenantId, actorId: parsed.data.actorId ?? actor.actorId, reason: parsed.data.reason })
      : await incidents.clear(parsed.data.tenantId, parsed.data.reason, parsed.data.actorId ?? actor.actorId);
    await portfolio.markSevereMismatch(parsed.data.tenantId, state.severeMismatchOpen);
    return Response.json({ state });
  } catch (error) {
    return authError(error);
  }
}
