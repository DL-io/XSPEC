import { SafetyQuerySchema } from '@polyshore/api';
import { DecisionAuditRepository } from '@polyshore/db';
import { authError, getDb, requireApiAccess } from '../_server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = SafetyQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!query.success) return Response.json({ error: 'invalid audit query', issues: query.error.issues }, { status: 400 });
    await requireApiAccess(request, { tenantId: query.data.tenantId, permission: 'read', apiScope: 'api:read' });
    const audits = await new DecisionAuditRepository(getDb()).latestForTenant(query.data.tenantId, 50);
    return Response.json({ audits });
  } catch (error) {
    return authError(error);
  }
}
