import { dispatchAlert, WebhookAlertSink, type AlertSink } from '@polyshore/alerts';
import { loadConfig } from '@polyshore/config';
import { createDb, SystemEventRepository, WorkerHealthRepository } from '@polyshore/db';
import { logInfo } from '@polyshore/observability';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const events = new SystemEventRepository(db);
const health = new WorkerHealthRepository(db);
const sinks: AlertSink[] = [config.ALERT_WEBHOOK_URL, config.SMS_WEBHOOK_URL].filter((url): url is string => Boolean(url)).map((url) => new WebhookAlertSink(url));

async function alertOnce() {
  const alerts = await events.pendingAlerts(100);
  for (const alert of alerts) {
    await dispatchAlert(alert, sinks);
    await events.markAlertDispatched(alert, sinks.length);
  }
  await health.heartbeat({ worker: 'alert-worker', status: 'ok', lastHeartbeatAt: new Date(), lastSuccessAt: new Date(), metadata: { alerts: alerts.length, sinks: sinks.length } });
  logInfo('alert worker cycle complete', { alerts: alerts.length, sinks: sinks.length });
}

await loop('alert-worker', alertOnce);

async function loop(worker: string, run: () => Promise<void>) {
  let backoffMs = 1_000;
  for (;;) {
    try {
      await run();
      backoffMs = 1_000;
      await sleep(10_000);
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
