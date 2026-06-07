import { DecisionAuditRepository } from '@polyshore/db';
import { authError, getDb, requireApiAccess } from '../_server';
import { z } from 'zod';

const AuditQuerySchema = z.object({
  tenantId: z.string().min(1),
  limit: z.coerce.number().int().positive().max(100).default(50), // HARDENED: audit limit is validated and clamped.
  offset: z.coerce.number().int().min(0).default(0), // HARDENED: audit pagination cannot pass arbitrary DB values.
  decision: z.enum(['APPROVE', 'REJECT']).optional(), // HARDENED: decision filter is allowlisted.
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = AuditQuerySchema.safeParse(Object.fromEntries(url.searchParams)); // HARDENED: all audit query params are parsed through Zod.
    if (!query.success) return Response.json({ error: 'invalid audit query', issues: query.error.issues }, { status: 400 });
    await requireApiAccess(request, { tenantId: query.data.tenantId, permission: 'read', apiScope: 'api:read' });
    const rawAudits = await new DecisionAuditRepository(getDb()).latestForTenant(query.data.tenantId, Math.min(100, query.data.limit + query.data.offset));
    const from = query.data.from ? new Date(query.data.from).getTime() : undefined;
    const to = query.data.to ? new Date(query.data.to).getTime() : undefined;
    const audits = rawAudits
      .filter((audit) => query.data.decision === undefined || (query.data.decision === 'APPROVE' ? audit.finalOutcome === 'trade' : audit.finalOutcome !== 'trade'))
      .filter((audit) => from === undefined || new Date(audit.createdAt).getTime() >= from)
      .filter((audit) => to === undefined || new Date(audit.createdAt).getTime() <= to)
      .slice(query.data.offset, query.data.offset + query.data.limit);
    return Response.json({ audits });
  } catch (error) {
    return authError(error);
  }
}
