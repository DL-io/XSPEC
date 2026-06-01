import { DossierQuerySchema } from '@polyshore/api';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = DossierQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) return Response.json({ error: 'invalid dossier query', issues: query.error.issues }, { status: 400 });
  return Response.json({ error: 'dossier repository is not configured' }, { status: 503 });
}
