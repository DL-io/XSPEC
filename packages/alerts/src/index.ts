import type { AlertEvent } from '@polyshore/core';

export interface AlertSink { send(event: AlertEvent): Promise<void>; }

export class WebhookAlertSink implements AlertSink {
  constructor(private readonly url: string) {}
  async send(event: AlertEvent): Promise<void> {
    const response = await fetch(this.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) });
    if (!response.ok) throw new Error(`Webhook alert failed: ${response.status}`);
  }
}

export async function dispatchAlert(event: AlertEvent, sinks: AlertSink[]): Promise<void> {
  if (event.severity === 'critical' && event.channel === 'sms' && sinks.length === 0) throw new Error('Critical SMS alert has no configured sink.');
  await Promise.all(sinks.map((sink) => sink.send(event)));
}
