import { ResearchPackRequestSchema } from '@polyshore/api';
import { DossierRepository, ResearchPackRepository } from '@polyshore/db';
import { renderResearchPack } from '@polyshore/reports';
import { getDb } from '../_server';

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = ResearchPackRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'invalid research pack request', issues: parsed.error.issues }, { status: 400 });
  const db = getDb();
  const dossiers = await Promise.all(parsed.data.marketIds.map((marketId) => new DossierRepository(db).latest(marketId)));
  const missing = parsed.data.marketIds.filter((_, index) => !dossiers[index]);
  if (missing.length) return Response.json({ error: 'dossiers missing for research pack', missing }, { status: 404 });
  const pack = renderResearchPack({ id: crypto.randomUUID(), tenantId: parsed.data.tenantId, title: parsed.data.title, dossiers: dossiers.filter((dossier) => dossier !== null) });
  await new ResearchPackRepository(db).put(pack);
  return Response.json(pack);
}
