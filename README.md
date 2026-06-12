Most traders on Polymarket and Kalshi are operating blind — no research pipeline, no risk controls, no probability models that learn from their own track record. The platforms give you a price and a contract; everything else is guesswork. XSPEC is the trading infrastructure that serious prediction market operators build in-house over months. We built it. Now we're opening it up.

## What You Get

- Automated research dossiers generated on every market before a dollar moves
- 16 hard risk gates that cannot be bypassed — capital protection baked into the core
- 9-model ensemble with calibration feedback — probability estimates that improve over time
- Paper trading mode that mirrors live execution exactly — prove your edge before you risk real money
- Operator dashboard with real-time positions, exposure, equity curve, and emergency kill switch
- Polymarket and Kalshi in one platform with cross-venue relative value analysis

## How It Works

**Step 1:** Scanner finds and filters markets across Polymarket and Kalshi in real time.

**Step 2:** Research pipeline builds a full dossier — facts, base rates, sentiment, microstructure, catalyst analysis.

**Step 3:** 9 models estimate probability and an ensemble engine weighs, calibrates, and scores each opportunity.

**Step 4:** Risk fortress approves or blocks every trade — every decision is audited, nothing bypasses the gates.

## Back Us on Kickstarter

XSPEC is crowdfunded — built in public, shaped by the operators who back it. The campaign funds final live trading validation, venue integrations, and dashboard polish. If you trade prediction markets and want a real edge, this is your platform — and this is the moment to get in at the ground level.

**[Back XSPEC on Kickstarter →]([KICKSTARTER_LINK])**

## Dashboard

> Screenshots and live demo coming soon — dashboard UI is in active development.

## Architecture

- `apps/terminal`: operator dashboard and API routes
- `packages/core`: shared domain contracts
- `packages/venues`: Polymarket and Kalshi market/order connectors
- `packages/scanner`: orderbook-aware market eligibility gates
- `packages/research`: structured research dossier pipeline
- `packages/models`: probability estimates and ensemble logic
- `packages/risk`: 16 hard risk gates
- `packages/execution`: paper and live order lifecycle handling
- `packages/reconciliation`: local-vs-venue mismatch checks
- `packages/db`: Drizzle schema, migrations, repositories
- `workers/*`: scanner, execution, reconciliation, research, calibration, and alerts

There is no `server/agent` tree in this checkout. The production runtime path is the package/worker pipeline above.

## Quick Start

**macOS — double-click:**

```
bin/macos/XSPEC.command          # launch full stack (workers + terminal + browser)
bin/macos/XSPEC-stop.command     # stop all processes
bin/macos/XSPEC-status.command   # show pm2 status + worker heartbeats
```

**CLI:**

```bash
make start     # launch full stack
make stop      # stop all processes
make status    # pm2 status + /api/health
make logs      # tail pm2 logs
make restart   # pm2 restart all
make e2e       # run paper:e2e test suite
make deploy    # deploy:check + railway up
```

**Manual:**

```bash
pnpm install
pnpm check
pnpm preflight
pm2 start ecosystem.config.cjs
open http://localhost:3000
```

Requires `.env` with `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`. See [ENVIRONMENT.md](ENVIRONMENT.md).

## Install

```bash
pnpm install
pnpm check
pnpm preflight
```

## Environment

Copy `.env.example` into the deployment environment and provide real MySQL/TiDB, Redis, operator, provider, alert, and venue values. Secret values must not be committed or logged.

Required base keys:

- `DATABASE_URL`
- `REDIS_URL`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`

Local reasoning can use Ollama:

- `OLLAMA_BASE_URL`, usually `http://127.0.0.1:11434`
- `OLLAMA_MODEL`, default `gemma3:27b`

When `OLLAMA_BASE_URL` is set, Ollama is preferred over hosted OpenAI or Anthropic reasoning providers.

Live Polymarket execution additionally requires:

- `LIVE_TRADING_ENABLED=true`
- `KILLSWITCH_ARMED=true`
- `POLYMARKET_PRIVATE_KEY`
- `POLYMARKET_API_KEY`
- `POLYMARKET_SECRET`
- `POLYMARKET_PASSPHRASE`
- funded wallet/proxy and sufficient CLOB balance/allowance

`pnpm preflight` prints a live readiness map. Missing fields keep live mode blocked.

## Paper Mode

Paper mode is the default. Paper execution uses bid/ask orderbook depth, limit prices, partial fills, and rejected fills when executable depth is insufficient. Paper mode is suitable for scanner, research, risk, dashboard, and reconciliation dry runs, but it is not proof of live exchange readiness.

## Live Mode

Live mode fails closed by default. `OPERATING_MODE=live` is rejected unless the live readiness map is complete. Live execution uses `@polymarket/clob-client-v2`, a viem signer, signed GTC limit orders, L2 credentials, and pre-submit balance/allowance checks. Reconciliation and risk gates can still block orders after configuration passes.

Live mode is gated behind a full paper trading validation period by design — XSPEC does not allow live execution until the system proves it is ready.

## Commands

```bash
pnpm lint
pnpm check
pnpm test
pnpm build
pnpm preflight
pnpm validate-config
pnpm smoke
pnpm db:check
pnpm db:migrate
```

Run `pnpm db:migrate` only against the intended database. `pnpm db:push` is not defined in this repo.
Use `WORKER_ONCE=true pnpm --filter <worker-package> start` to run a single worker cycle during deployment smoke tests.

## Safety Gates

Risk gates enforce reconciliation state, live authorization, kill switch, daily loss, drawdown, exposure, open orders, minimum edge, minimum confidence, spread, liquidity participation, deep anomaly, and order sizing.

Default first-live conservative mandate:

- `minEdge`: 0.06
- `minConfidence`: 0.70
- `maxSpread`: 0.03
- `maxSingleMarketExposure`: 3%
- `maxCategoryExposure`: 8%
- `maxTotalExposure`: 20%
- `fractionalKelly`: 0.25

## Deployment

Use Railway or a self-hosted Node process manager with MySQL-compatible storage and Redis. Start the terminal app plus the required workers. Confirm `/api/health`, `/api/overview`, worker heartbeats, reconciliation status, and `pnpm preflight` before any live-mode attempt.

## Troubleshooting

- Live config fails: run `pnpm preflight` and inspect `liveReadiness.missing`.
- No candidates: check scanner worker logs, market liquidity, spreads, and orderbook freshness.
- Live order rejected: check wallet balance, CLOB allowance, Polymarket L2 credentials, and reconciliation status.
- Dashboard stale banner: scanner worker heartbeat or audit timestamps are old.
