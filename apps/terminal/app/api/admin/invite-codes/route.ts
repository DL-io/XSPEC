import { InviteCodeRepository } from '@polyshore/db';
import { authError, getDb, jsonError, requireOwner, securityHeaders } from '../../_server';

export async function GET(request: Request) {
  try {
    const { actorId } = await requireOwner(request);
    const codes = await new InviteCodeRepository(getDb()).list();
    return Response.json({ codes }, { headers: securityHeaders() });
  } catch (error) {
    return authError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { actorId } = await requireOwner(request);
    const code = await new InviteCodeRepository(getDb()).create(actorId);
    return Response.json({ code }, { status: 201, headers: securityHeaders() });
  } catch (error) {
    return authError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireOwner(request);
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return jsonError('id required', 400);
    await new InviteCodeRepository(getDb()).deactivate(id);
    return Response.json({ ok: true }, { headers: securityHeaders() });
  } catch (error) {
    return authError(error);
  }
}
