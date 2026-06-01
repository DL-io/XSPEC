import { SignalQuerySchema } from '@polyshore/api';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = SignalQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) return Response.json({ error: 'invalid signal query', issues: query.error.issues }, { status: 400 });
  return Response.json({ error: 'signals repository is not configured' }, { status: 503 });
}
