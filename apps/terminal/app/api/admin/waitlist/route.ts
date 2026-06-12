import { WaitlistRepository } from '@polyshore/db';
import { authError, getDb, jsonError, requireOwner, securityHeaders } from '../../_server';

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const entries = await new WaitlistRepository(getDb()).list();
    return Response.json({ entries }, { headers: securityHeaders() });
  } catch (error) {
    return authError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireOwner(request);
    const body = await request.json() as { id: string };
    if (!body.id) return jsonError('id required', 400);
    await new WaitlistRepository(getDb()).markContacted(body.id);
    return Response.json({ ok: true }, { headers: securityHeaders() });
  } catch (error) {
    return authError(error);
  }
}
