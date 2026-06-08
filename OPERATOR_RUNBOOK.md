# OPERATOR RUNBOOK

## Daily Paper Operation

1. Confirm env:
   ```bash
   pnpm validate-config
   pnpm preflight
   ```
2. Confirm migrations:
   ```bash
   pnpm db:check
   ```
3. Start terminal and workers through Railway, PM2, or systemd.
4. Open the terminal dashboard and confirm:
   - health endpoint is ok
   - scanner, research, execution, and reconciliation workers are heartbeating
   - kill switch state is visible
   - reconciliation status has no severe mismatch
   - open orders and fills reflect persisted state

## Kill Switch

Use the Configuration page or `/api/safety` to activate the kill switch. New live execution must stop when the kill switch is active.

## Reconciliation Incident

If reconciliation reports a severe mismatch:

1. Treat new execution as blocked.
2. Compare local orders, fills, balances, and venue state.
3. Acknowledge only after an operator has reviewed the mismatch.
4. Clear only after local and venue state are correct.

## Live Activation

Live activation is not a default state. Before live:

```bash
pnpm check
pnpm build
pnpm db:migrate
pnpm preflight
SMOKE_RUN_LOCAL_CHECKS=true SMOKE_START_SERVER=true SMOKE_WORKERS=true pnpm smoke
```

Then verify real Polymarket balance, allowance, credential, and reconciliation status. Do not enable live authorization while the kill switch is active.

## Rollback

1. Activate kill switch.
2. Stop execution worker.
3. Cancel open venue orders through the exchange or connector.
4. Run reconciliation.
5. Restart workers only after the incident is resolved.
