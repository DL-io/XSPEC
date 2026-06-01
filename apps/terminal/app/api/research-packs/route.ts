import { ResearchPackRequestSchema } from '@polyshore/api';

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = ResearchPackRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'invalid research pack request', issues: parsed.error.issues }, { status: 400 });
  return Response.json({ error: 'research pack repository is not configured' }, { status: 503 });
}
