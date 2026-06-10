const shared = {
  NODE_ENV: 'production',
  TRUST_OPERATOR_ROLE_HEADERS: 'true',
};

module.exports = {
  apps: [
    { name: 'polyshore-terminal', script: 'pnpm', args: '--filter @polyshore/terminal start', env: shared },
    { name: 'polyshore-scanner', script: 'pnpm', args: '--filter @polyshore/scanner-worker start', env: shared },
    { name: 'polyshore-research', script: 'pnpm', args: '--filter @polyshore/research-worker start', env: shared },
    { name: 'polyshore-execution', script: 'pnpm', args: '--filter @polyshore/execution-worker start', env: shared },
    { name: 'polyshore-reconciliation', script: 'pnpm', args: '--filter @polyshore/reconciliation-worker start', env: shared },
    { name: 'polyshore-calibration', script: 'pnpm', args: '--filter @polyshore/calibration-worker start', env: shared },
    { name: 'polyshore-alerts', script: 'pnpm', args: '--filter @polyshore/alert-worker start', env: shared }
  ]
};
