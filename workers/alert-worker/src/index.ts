import { loadConfig } from '@polyshore/config';
import { logInfo } from '@polyshore/observability';

const config = loadConfig();
logInfo('alert worker ready', { webhookConfigured: Boolean(config.ALERT_WEBHOOK_URL), smsConfigured: Boolean(config.SMS_WEBHOOK_URL) });
