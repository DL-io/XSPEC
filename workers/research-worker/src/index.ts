import { loadConfig } from '@polyshore/config';
import { logInfo } from '@polyshore/observability';

loadConfig();
logInfo('research worker ready; queue binding required through deployment configuration');
