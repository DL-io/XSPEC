import { SafetyQuerySchema } from '@polyshore/api';
import { ConfigOverrideRepository, DecisionAuditRepository, OrderRepository, PortfolioRepository, ReconciliationIncidentRepository, WorkerHealthRepository } from '@polyshore/db';
import { getDb } from '../_server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = SafetyQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) return Response.json({ error: 'invalid overview query', issues: query.error.issues }, { status: 400 });
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
}
