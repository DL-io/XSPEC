import { describe, expect, it } from 'vitest';
import type { AlertEvent } from '@polyshore/core';
import { dispatchAlert, validateWebhookUrl, type AlertSink } from './index';

const alert: AlertEvent = {
  id: 'alert-1',
  tenantId: 'tenant-1',
  severity: 'warning',
  channel: 'webhook',
  eventType: 'test.alert',
  message: 'test',
  createdAt: new Date()
};

describe('webhook alert security', () => {
  it('rejects localhost and private webhook targets', () => {
    expect(() => validateWebhookUrl('http://example.com/hook')).toThrow('https://');
    expect(() => validateWebhookUrl('https://localhost/hook')).toThrow('not allowed');
    expect(() => validateWebhookUrl('https://127.0.0.1/hook')).toThrow('not allowed');
    expect(() => validateWebhookUrl('https://169.254.169.254/latest/meta-data')).toThrow('not allowed');
    expect(() => validateWebhookUrl('https://10.0.0.1/hook')).toThrow('not allowed');
    expect(validateWebhookUrl('https://alerts.example.com/hook').hostname).toBe('alerts.example.com');
  });

  it('does not fail dispatch when at least one sink succeeds', async () => {
    const failing: AlertSink = { send: async () => { throw new Error('sink failed'); } };
    const succeeding: AlertSink = { send: async () => undefined };

    await expect(dispatchAlert(alert, [failing, succeeding])).resolves.toBeUndefined();
  });

  it('reports all-sink failure', async () => {
    const failing: AlertSink = { send: async () => { throw new Error('sink failed'); } };

    await expect(dispatchAlert(alert, [failing])).rejects.toThrow('All alert sinks failed');
  });
});
