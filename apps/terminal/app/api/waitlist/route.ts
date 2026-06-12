import { WaitlistRepository } from '@polyshore/db';
import { getDb, jsonError, securityHeaders } from '../_server';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; name?: string; message?: string };
    const email = (body.email ?? '').trim();
    const name = (body.name ?? '').trim();
    const message = (body.message ?? '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError('valid email required', 400);
    if (!name || name.length < 2) return jsonError('name required', 400);
    if (!message || message.length < 10) return jsonError('message required (min 10 chars)', 400);
    await new WaitlistRepository(getDb()).create({ email, name, message });
    return Response.json({ ok: true }, { status: 201, headers: securityHeaders() });
  } catch (error) {
    return Response.json({ error: 'internal server error' }, { status: 500, headers: securityHeaders() });
  }
}
