module.exports = {
  apps: [
    { name: 'polyshore-terminal', script: 'pnpm', args: '--filter @polyshore/terminal start', env: { NODE_ENV: 'production' } },
    { name: 'polyshore-scanner', script: 'pnpm', args: '--filter @polyshore/scanner-worker start', env: { NODE_ENV: 'production' } },
    { name: 'polyshore-research', script: 'pnpm', args: '--filter @polyshore/research-worker start', env: { NODE_ENV: 'production' } },
    { name: 'polyshore-execution', script: 'pnpm', args: '--filter @polyshore/execution-worker start', env: { NODE_ENV: 'production' } },
    { name: 'polyshore-reconciliation', script: 'pnpm', args: '--filter @polyshore/reconciliation-worker start', env: { NODE_ENV: 'production' } },
    { name: 'polyshore-calibration', script: 'pnpm', args: '--filter @polyshore/calibration-worker start', env: { NODE_ENV: 'production' } },
    { name: 'polyshore-alerts', script: 'pnpm', args: '--filter @polyshore/alert-worker start', env: { NODE_ENV: 'production' } }
  ]
};
