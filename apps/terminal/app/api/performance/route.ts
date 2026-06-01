import { PerformanceQuerySchema } from '@polyshore/api';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = PerformanceQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) return Response.json({ error: 'invalid performance query', issues: query.error.issues }, { status: 400 });
  return Response.json({ error: 'performance repository is not configured' }, { status: 503 });
}
