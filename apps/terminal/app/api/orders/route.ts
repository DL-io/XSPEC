import { SafetyQuerySchema } from '@polyshore/api';
import { OrderRepository } from '@polyshore/db';
import { getDb } from '../_server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = SafetyQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) return Response.json({ error: 'invalid orders query', issues: query.error.issues }, { status: 400 });
  const orders = await new OrderRepository(getDb(), query.data.tenantId).listForTenant(100);
  return Response.json({ orders });
}
