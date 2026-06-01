# Live Mode Runbook

Live mode is blocked unless configuration, credentials, operator authorization, and dual confirmation are present.

Required checks:

- `pnpm preflight` passes.
- Reconciliation has no severe mismatch.
- Kill switch is inactive.
- Venue order signing is configured.
- At least one non-UI alert channel is verified.
- Risk mandate is selected and audited.
