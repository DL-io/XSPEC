import { SignalQuerySchema } from '@polyshore/api';
import { DecisionAuditRepository } from '@polyshore/db';
import { getDb } from '../_server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = SignalQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) return Response.json({ error: 'invalid signal query', issues: query.error.issues }, { status: 400 });
  const audits = await new DecisionAuditRepository(getDb()).latestForTenant(query.data.tenantId);
  const signals = audits
    .filter((audit) => audit.ensembleOutput && audit.riskDecision)
    .filter((audit) => query.data.minEdge === undefined || (audit.edgeCalculations?.penalizedEdge ?? 0) >= query.data.minEdge)
    .map((audit) => ({
      marketId: audit.marketId,
      probability: audit.ensembleOutput?.ensembleProbability,
      uncertainty: audit.ensembleOutput?.ensembleUncertainty,
      confidence: audit.ensembleOutput?.ensembleConfidence,
      finalOutcome: audit.finalOutcome,
      riskApproved: audit.riskDecision?.approved,
      opportunityScore: audit.opportunityScore,
      createdAt: audit.createdAt
    }));
  return Response.json({ signals });
}
