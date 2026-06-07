import type { AlertEvent } from '@polyshore/core';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface AlertSink { send(event: AlertEvent): Promise<void>; }

export class WebhookAlertSink implements AlertSink {
  private readonly parsedUrl: URL;

  constructor(private readonly url: string) {
    this.parsedUrl = validateWebhookUrl(url);
  }

  async send(event: AlertEvent): Promise<void> {
    try {
      await assertPublicResolution(this.parsedUrl.hostname);
      const response = await fetch(this.parsedUrl.toString(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) });
      if (!response.ok) throw new Error(`Webhook alert failed: ${response.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Webhook alert dispatch failed: ${message}`);
    }
  }
}

export async function dispatchAlert(event: AlertEvent, sinks: AlertSink[]): Promise<void> {
  if (event.severity === 'critical' && event.channel === 'sms' && sinks.length === 0) throw new Error('Critical SMS alert has no configured sink.');
  const results = await Promise.allSettled(sinks.map((sink) => sink.send(event)));
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failures.length === results.length && failures.length > 0) {
    throw new Error(`All alert sinks failed: ${failures.map((failure) => failure.reason instanceof Error ? failure.reason.message : String(failure.reason)).join('; ')}`);
  }
}

export function validateWebhookUrl(value: string): URL {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new Error('Webhook URL must use https://');
  if (isPrivateHostname(parsed.hostname)) throw new Error('Webhook URL host is not allowed');
  return parsed;
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isPrivateIpv4(normalized);
  if (ipVersion === 6) return isPrivateIpv6(normalized);
  return false;
}

function isPrivateIpv4(value: string): boolean {
  const parts = value.split('.').map(Number);
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(value: string): boolean {
  return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:');
}

async function assertPublicResolution(hostname: string) {
  if (isIP(hostname)) return;
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (records.some((record) => isPrivateHostname(record.address))) throw new Error('Webhook URL resolves to a private address');
}
