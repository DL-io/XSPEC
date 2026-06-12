import { UserAdminRepository } from '@polyshore/db';
import { authError, getDb, jsonError, requireOwner, securityHeaders } from '../../_server';

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const users = await new UserAdminRepository(getDb()).listAll();
    return Response.json({ users }, { headers: securityHeaders() });
  } catch (error) {
    return authError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireOwner(request);
    const body = await request.json() as { userId: string; status: string };
    if (!body.userId || !['active', 'pending', 'suspended'].includes(body.status)) {
      return jsonError('userId and valid status required', 400);
    }
    await new UserAdminRepository(getDb()).setStatus(body.userId, body.status as 'active' | 'pending' | 'suspended');
    return Response.json({ ok: true }, { headers: securityHeaders() });
  } catch (error) {
    return authError(error);
  }
}
