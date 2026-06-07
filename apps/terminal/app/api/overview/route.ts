import { SafetyQuerySchema } from '@polyshore/api';
import { ConfigOverrideRepository, DecisionAuditRepository, OrderRepository, PortfolioRepository, ReconciliationIncidentRepository, WorkerHealthRepository } from '@polyshore/db';
import { authError, getDb, requireApiAccess } from '../_server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = SafetyQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!query.success) return Response.json({ error: 'invalid overview query', issues: query.error.issues }, { status: 400 });
    await requireApiAccess(request, { tenantId: query.data.tenantId, permission: 'read', apiScope: 'api:read' });
    const db = getDb();
    const portfolioRepository = new PortfolioRepository(db);
    const [safety, reconciliation, portfolio, portfolioHistory, audits, orders, workers] = await Promise.all([
      new ConfigOverrideRepository(db).readSafetyState(query.data.tenantId),
      new ReconciliationIncidentRepository(db).state(query.data.tenantId),
      portfolioRepository.latest(query.data.tenantId),
      portfolioRepository.history(query.data.tenantId, 50),
      new DecisionAuditRepository(db).latestForTenant(query.data.tenantId, 10),
      new OrderRepository(db, query.data.tenantId).listForTenant(10),
      new WorkerHealthRepository(db).latest()
    ]);
    return Response.json({ safety, reconciliation, portfolio, portfolioHistory, audits, orders, workers });
  } catch (error) {
    return authError(error);
  }
}
