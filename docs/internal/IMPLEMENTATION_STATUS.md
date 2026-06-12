# XSPEC Implementation Status

Last updated: 2026-06-07

## Verified

- Next.js terminal pages render operational views backed by API routes.
- Scanner gates use executable orderbook bid/ask data after market discovery.
- Paper execution uses bid/ask depth and persists lifecycle transitions.
- Risk package exposes 16 hard gates.
- Polymarket connector has SDK-backed authenticated order, cancel, order lookup, portfolio, and position methods.
- Live mode fails closed unless the typed live readiness map is complete.
- Drizzle schema and migrations include first-class tables for markets, orderbooks, dossiers, probability estimates, audits, orders, lifecycle events, fills, portfolio snapshots, reconciliation runs, risk events, config, and mode/safety state.

## Not Proven

- Live Polymarket trading has not been proven against a funded account in this environment.
- `pnpm db:migrate` / database push has not been run here because no safe deployment database was supplied.
- Runtime production smoke against a deployed service has not been completed in this environment.

## Current Readiness

- Paper trading: ready after `pnpm check` and `pnpm preflight` pass with valid local env.
- Live trading: not ready until external credentials, funding, allowances, migrations, Redis, worker heartbeats, and runtime smoke checks pass.

This file intentionally does not claim production/live readiness without those proofs.
