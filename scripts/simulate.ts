import { readFileSync } from 'node:fs';
import { summarizeReplay, type SimulationTrade } from '@polyshore/simulations';

const file = process.argv[2];
if (!file) throw new Error('Usage: pnpm simulate <replay-json-file>');
const trades = JSON.parse(readFileSync(file, 'utf8')) as SimulationTrade[];
console.log(JSON.stringify(summarizeReplay(trades), null, 2));
