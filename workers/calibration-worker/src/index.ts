import { loadConfig } from '@polyshore/config';
import type { CalibrationRecord, DecisionAudit } from '@polyshore/core';
import { CalibrationRecordRepository, createDb, DecisionAuditRepository, WorkerHealthRepository } from '@polyshore/db';
import { logInfo } from '@polyshore/observability';

const config = loadConfig();
const tenantId = process.env.TENANT_ID ?? 'system';
const db = createDb(config.DATABASE_URL);
const health = new WorkerHealthRepository(db);

async function calibrationOnce() {
  const audits = await new DecisionAuditRepository(db).latestForTenant(tenantId, 100);
  const records = audits.map(calibrationFromAudit).filter((record) => record !== null);
  const repository = new CalibrationRecordRepository(db);
  for (const record of records) await repository.put(record);
  await health.heartbeat({ worker: 'calibration-worker', status: 'ok', lastHeartbeatAt: new Date(), lastSuccessAt: new Date(), metadata: { records: records.length } });
  logInfo('calibration worker cycle complete', { records: records.length });
}

await loop('calibration-worker', calibrationOnce);

function calibrationFromAudit(audit: DecisionAudit): CalibrationRecord | null {
  const backfill = audit.calibrationBackfill;
  if (!backfill?.resolvedAt || backfill.outcome === undefined || backfill.predictedProbability === undefined) return null;
  const predictedProbability = backfill.predictedProbability;
  const outcome = backfill.outcome;
  const brierScore = (predictedProbability - outcome) ** 2;
  return {
    id: `calibration:${audit.id}`,
    marketId: audit.marketId,
    resolvedAt: backfill.resolvedAt,
    predictedProbability,
    outcome,
    brierScore,
    directionalAccuracy: predictedProbability >= 0.5 ? outcome === 1 : outcome === 0,
    sharpness: Math.abs(predictedProbability - 0.5),
    modelRecommendations: audit.modelEstimates.map((estimate) => estimate.modelId)
  };
}

async function loop(worker: string, run: () => Promise<void>) {
  let backoffMs = 1_000;
  for (;;) {
    try {
      await run();
      backoffMs = 1_000;
      await sleep(config.RECONCILIATION_SECONDS * 1000);
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
