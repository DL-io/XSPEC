# XSPEC / POLY-SHORE

TypeScript prediction-market trading infrastructure for Polymarket and Kalshi. The repo contains a Next.js operator terminal, venue connectors, scanner/research/execution/reconciliation workers, Drizzle/MySQL persistence, Redis-backed API controls, and risk gates.

## Quick Start

**macOS — double-click:**

```
XSPEC.command          # launch full stack (workers + terminal + browser)
XSPEC-stop.command     # stop all processes
XSPEC-status.command   # show pm2 status + worker heartbeats
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
- `OLLAMA_MODEL`, default `gpt-oss:120b`

When `OLLAMA_BASE_URL` is set, Ollama is preferred over hosted OpenAI or Anthropic reasoning providers. `gpt-oss:120b` is the highest-capacity default and requires substantial local or external model storage/compute. Use a smaller model value when the machine cannot run it.

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

Live trading is **not ready** until external prerequisites are proven against the target environment: funded account, valid Polymarket credentials, allowances, database migrations applied, Redis reachable, workers heartbeating, and runtime smoke tests passing.

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
