import { DossierQuerySchema } from '@polyshore/api';
import { DossierRepository } from '@polyshore/db';
import { authError, getDb, jsonError, requireApiAccess } from '../_server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = DossierQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!query.success) return Response.json({ error: 'invalid dossier query', issues: query.error.issues }, { status: 400 });
    await requireApiAccess(request, { tenantId: query.data.tenantId, permission: 'read', apiScope: 'api:read' });
    const dossier = await new DossierRepository(getDb()).latest(query.data.marketId);
    if (!dossier) return jsonError('dossier not found', 404);
    return Response.json(dossier);
  } catch (error) {
    return authError(error);
  }
}
