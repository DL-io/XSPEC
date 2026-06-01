import { loadConfig } from '@polyshore/config';
import { logInfo } from '@polyshore/observability';

const config = loadConfig();
logInfo('execution worker ready', { mode: config.OPERATING_MODE });
