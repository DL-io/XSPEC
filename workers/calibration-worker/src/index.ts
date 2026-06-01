import { loadConfig } from '@polyshore/config';
import { logInfo } from '@polyshore/observability';

loadConfig();
logInfo('calibration worker ready');
