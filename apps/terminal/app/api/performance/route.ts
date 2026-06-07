import { PerformanceQuerySchema } from '@polyshore/api';
import { PerformanceRepository } from '@polyshore/db';
import { authError, getDb, requireApiAccess } from '../_server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = PerformanceQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!query.success) return Response.json({ error: 'invalid performance query', issues: query.error.issues }, { status: 400 });
    await requireApiAccess(request, { tenantId: query.data.tenantId, permission: 'read', apiScope: 'api:read' });
    const summary = await new PerformanceRepository(getDb()).calibrationSummary({
      from: query.data.from ? new Date(query.data.from) : undefined,
      to: query.data.to ? new Date(query.data.to) : undefined
    });
    return Response.json(summary);
  } catch (error) {
    return authError(error);
  }
}
