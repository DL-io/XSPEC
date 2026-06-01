import type { CalibrationRecord, DecisionAudit } from '@polyshore/core';

export interface AuditWriter { appendDecision(record: DecisionAudit): Promise<void>; backfillCalibration(auditId: string, calibration: Partial<CalibrationRecord>): Promise<void>; }

export function assertCompleteDecisionAudit(record: DecisionAudit): void {
  const missing = [
    !record.scannerData && 'scannerData',
    !record.modelEstimates && 'modelEstimates',
    !record.finalOutcome && 'finalOutcome'
  ].filter(Boolean);
  if (missing.length) throw new Error(`Incomplete decision audit: ${missing.join(', ')}`);
}
