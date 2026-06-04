# OMEGA

POLY-SHORE OMEGA X is a TypeScript-first prediction-market intelligence, risk, execution, reconciliation, and operator platform for Polymarket and Kalshi.

## Repository

- `apps/terminal`: Next.js 15 operator terminal and API routes
- `packages/core`: canonical domain contracts
- `packages/risk`: pure 16-gate Risk Fortress
- `packages/execution`: paper and live limit-order execution contracts
- `packages/reconciliation`: venue/local mismatch checks
- `packages/db`: Drizzle/MySQL schema and repositories
- `packages/research`: required dossier stages and structured provider chain
- `workers/*`: scanner, research, execution, reconciliation, calibration, and alert workers

## Commands

```bash
pnpm install
pnpm test
pnpm preflight
pnpm build
```

In local paths containing `:`, pnpm script PATH injection may fail. Running local binaries directly works:

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
```

## Configuration

Copy `.env.example` into the deployment environment and provide real MySQL/TiDB, Redis, credential, provider, and alert-channel values. `REDIS_URL` must be a standard `redis://` or `rediss://` connection URL; Upstash REST URL/token values are not mapped into `REDIS_URL`. Live mode remains blocked until operator confirmation, credentials, reconciliation, kill-switch, and risk gates allow it.

# XSPEC
