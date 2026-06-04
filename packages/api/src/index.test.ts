import { describe, expect, it } from 'vitest';
import { ReconciliationQuerySchema, ReconciliationUpdateSchema, SafetyUpdateSchema } from './index';

describe('safety API schemas', () => {
  it('requires a tenant and at least one safety update', () => {
    expect(SafetyUpdateSchema.safeParse({ tenantId: 'tenant-1' }).success).toBe(false);
    expect(SafetyUpdateSchema.safeParse({ killSwitch: { active: true, reason: 'stop' } }).success).toBe(false);
  });

  it('accepts kill switch and live authorization updates with reasons', () => {
    expect(SafetyUpdateSchema.safeParse({ tenantId: 'tenant-1', killSwitch: { active: true, reason: 'operator stop' } }).success).toBe(true);
    expect(SafetyUpdateSchema.safeParse({ tenantId: 'tenant-1', actorId: 'operator-1', liveAuthorization: { enabled: true, reason: 'dual confirmation' } }).success).toBe(true);
  });

  it('validates reconciliation state queries and operator updates', () => {
    expect(ReconciliationQuerySchema.safeParse({ tenantId: 'tenant-1' }).success).toBe(true);
    expect(ReconciliationUpdateSchema.safeParse({ tenantId: 'tenant-1', actorId: 'operator-1', action: 'acknowledge', reason: 'reviewed mismatch' }).success).toBe(true);
    expect(ReconciliationUpdateSchema.safeParse({ tenantId: 'tenant-1', actorId: 'operator-1', action: 'clear', reason: 'remediated' }).success).toBe(true);
    expect(ReconciliationUpdateSchema.safeParse({ tenantId: 'tenant-1', actorId: 'operator-1', action: 'ignore', reason: 'bad action' }).success).toBe(false);
  });
});
