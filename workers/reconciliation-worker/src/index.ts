import { loadConfig } from '@polyshore/config';
import { logInfo } from '@polyshore/observability';

const config = loadConfig();
logInfo('reconciliation worker ready', { cadenceSeconds: config.RECONCILIATION_SECONDS });
