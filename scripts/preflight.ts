import { liveReadiness, loadConfig } from '@polyshore/config';
import { RISK_GATE_ORDER } from '@polyshore/risk';

const config = loadConfig();
if (RISK_GATE_ORDER.length !== 16) throw new Error('Risk fortress must expose exactly 16 gates.');
if (config.OPERATING_MODE !== 'paper' && config.OPERATING_MODE !== 'live') throw new Error('Invalid operating mode.');
const readiness = liveReadiness(config);
console.log(JSON.stringify({
  ok: true,
  operatingMode: config.OPERATING_MODE,
  riskGates: RISK_GATE_ORDER.length,
  liveReadiness: readiness,
  paperReady: config.OPERATING_MODE === 'paper' || readiness.ready
}));
