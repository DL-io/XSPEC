import { loadConfig } from '@polyshore/config';
import { createDb, DecisionAuditRepository, DossierRepository, ResearchPackRepository, WorkerHealthRepository } from '@polyshore/db';
import { logInfo } from '@polyshore/observability';
import { buildDossier, checkResearchProviderHealth, createResearchStagesFromConfig } from '@polyshore/research';
import { renderResearchPack } from '@polyshore/reports';

const config = loadConfig();
const tenantId = process.env.TENANT_ID ?? 'system';
const db = createDb(config.DATABASE_URL);
const health = new WorkerHealthRepository(db);
const researchStages = createResearchStagesFromConfig(config);

async function researchOnce() {
  const audits = await new DecisionAuditRepository(db).latestForTenant(tenantId, 25);
  for (const audit of audits.slice(0, 8)) {
    const existing = await new DossierRepository(db).latest(audit.marketId);
    if (!existing) await new DossierRepository(db).put(await buildDossier(audit.scannerData, researchStages));
  }
  const marketIds = [...new Set(audits.map((audit) => audit.marketId))].slice(0, 8);
  const dossiers = (await Promise.all(marketIds.map((marketId) => new DossierRepository(db).latest(marketId)))).filter((dossier) => dossier !== null);
  const providerHealth = await checkResearchProviderHealth(config, false);
  if (dossiers.length > 0) {
    await new ResearchPackRepository(db).put(renderResearchPack({ id: crypto.randomUUID(), tenantId, title: `Research pack ${new Date().toISOString()}`, dossiers }));
  }
  await health.heartbeat({ worker: 'research-worker', status: 'ok', lastHeartbeatAt: new Date(), lastSuccessAt: new Date(), metadata: { dossiers: dossiers.length, providerHealth } });
  logInfo('research worker cycle complete', { dossiers: dossiers.length, providerHealth });
}

await loop('research-worker', researchOnce);

async function loop(worker: string, run: () => Promise<void>) {
  let backoffMs = 1_000;
  for (;;) {
    try {
      await run();
      backoffMs = 1_000;
      await sleep(config.WATCHLIST_POLL_SECONDS * 1000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await health.heartbeat({ worker, status: 'error', lastHeartbeatAt: new Date(), lastError: message });
      logInfo(`${worker} cycle failed`, { error: message, backoffMs });
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 60_000);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
