import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { validateConfigFromEnvFile } from '@polyshore/config';

interface SmokeStep {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
}

const steps: SmokeStep[] = [];
let server: ChildProcess | undefined;

void main();

async function main() {
  try {
    const validation = validateConfigFromEnvFile();
    steps.push({
      name: 'validate-config',
      status: 'pass',
      detail: JSON.stringify({
        operatingMode: validation.operatingMode,
        configuredKeys: validation.configuredKeys,
        liveReady: validation.liveReadiness.ready,
        missingLiveFields: Object.keys(validation.liveReadiness.missing)
      })
    });

    if (process.env.SMOKE_RUN_LOCAL_CHECKS === 'true') {
      runCommand('db-check', 'pnpm', ['db:check']);
      runCommand('build', 'pnpm', ['build']);
    } else {
      steps.push({ name: 'db-check', status: 'skip', detail: 'Set SMOKE_RUN_LOCAL_CHECKS=true to run pnpm db:check.' });
      steps.push({ name: 'build', status: 'skip', detail: 'Set SMOKE_RUN_LOCAL_CHECKS=true to run pnpm build.' });
    }

    const healthUrl = await resolveHealthUrl();
    if (healthUrl) await checkHealth(healthUrl);
    else steps.push({ name: 'health', status: 'skip', detail: 'Set SMOKE_BASE_URL or SMOKE_START_SERVER=true to verify health.' });

    if (process.env.SMOKE_WORKERS === 'true') {
      runWorker('scanner-worker', '--filter', '@polyshore/scanner-worker', 'start');
      runWorker('research-worker', '--filter', '@polyshore/research-worker', 'start');
      runWorker('execution-worker', '--filter', '@polyshore/execution-worker', 'start');
      runWorker('reconciliation-worker', '--filter', '@polyshore/reconciliation-worker', 'start');
      runWorker('alert-worker', '--filter', '@polyshore/alert-worker', 'start');
      runWorker('calibration-worker', '--filter', '@polyshore/calibration-worker', 'start');
    } else {
      steps.push({ name: 'workers', status: 'skip', detail: 'Set SMOKE_WORKERS=true to run each worker once against configured dependencies.' });
    }
  } catch (error) {
    steps.push({ name: 'smoke', status: 'fail', detail: error instanceof Error ? error.message : String(error) });
  } finally {
    if (server && !server.killed) server.kill('SIGTERM');
    console.log(JSON.stringify({ ok: !steps.some((step) => step.status === 'fail'), steps }, null, 2));
    if (steps.some((step) => step.status === 'fail')) process.exitCode = 1;
  }
}

function runCommand(name: string, command: string, args: string[], extraEnv: Record<string, string | undefined> = {}) {
  const result = spawnSync(command, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv }
  });
  const output = `${result.stdout}\n${result.stderr}`.trim().split('\n').slice(-20).join('\n');
  steps.push({ name, status: result.status === 0 ? 'pass' : 'fail', detail: output || `exit ${result.status ?? 'unknown'}` });
}

function runWorker(name: string, ...args: string[]) {
  runCommand(name, 'pnpm', args, { WORKER_ONCE: 'true' });
}

async function resolveHealthUrl() {
  if (process.env.SMOKE_BASE_URL) return normalizeHealthUrl(process.env.SMOKE_BASE_URL);
  if (process.env.SMOKE_START_SERVER !== 'true') return undefined;

  const port = process.env.PORT ?? '3000';
  server = spawn('pnpm', ['--filter', '@polyshore/terminal', 'start'], {
    stdio: 'ignore',
    env: { ...process.env, PORT: port }
  });
  const url = `http://127.0.0.1:${port}/api/health`;
  await waitForHealth(url);
  steps.push({ name: 'start-terminal', status: 'pass', detail: `production server answered ${url}` });
  return url;
}

function normalizeHealthUrl(value: string) {
  if (value.endsWith('/api/health')) return value;
  return `${value.replace(/\/$/, '')}/api/health`;
}

async function waitForHealth(url: string) {
  const deadline = Date.now() + Number(process.env.SMOKE_SERVER_TIMEOUT_MS ?? 30_000);
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`terminal health check did not pass: ${lastError}`);
}

async function checkHealth(url: string) {
  const response = await fetch(url, {
    headers: process.env.SMOKE_API_KEY ? { authorization: `Bearer ${process.env.SMOKE_API_KEY}` } : undefined
  });
  const body = await response.text();
  steps.push({ name: 'health', status: response.ok ? 'pass' : 'fail', detail: body.slice(0, 800) });
}
