import type { CalibrationRecord, DecisionAudit } from '@polyshore/core';

export interface AuditWriter { appendDecision(record: DecisionAudit): Promise<void>; backfillCalibration(auditId: string, calibration: Partial<CalibrationRecord>): Promise<void>; }

export function assertCompleteDecisionAudit(record: DecisionAudit): void {
  const missing = [
    !record.scannerData && 'scannerData',
    !record.featureSnapshot && 'featureSnapshot',
    !record.dossierId && 'dossierId',
    !record.modelEstimates && 'modelEstimates',
    !record.ensembleOutput && 'ensembleOutput',
    !record.riskDecision && 'riskDecision',
    !record.finalOutcome && 'finalOutcome',
    record.finalOutcome === 'trade' && !record.tradeProposal && 'tradeProposal'
  ].filter(Boolean);
  if (missing.length) throw new Error(`Incomplete decision audit: ${missing.join(', ')}`);
}
