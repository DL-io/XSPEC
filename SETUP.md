# SETUP

## Prerequisites

- Node.js 20 or newer
- pnpm 9.12.x
- MySQL-compatible database for real operation
- Redis-compatible endpoint for API rate limiting and coordination

## Local Install

```bash
pnpm install
cp .env.example .env
pnpm validate-config
pnpm check
pnpm build
```

Use real `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, and `ENCRYPTION_KEY` values before running workers or the terminal against persistent state.

## Paper Mode

Paper mode is the default:

```bash
OPERATING_MODE=paper pnpm preflight
pnpm db:migrate
pnpm --filter @polyshore/terminal start
```

In another shell, start the workers needed for continuous operation:

```bash
pnpm --filter @polyshore/scanner-worker start
pnpm --filter @polyshore/research-worker start
pnpm --filter @polyshore/execution-worker start
pnpm --filter @polyshore/reconciliation-worker start
pnpm --filter @polyshore/alert-worker start
pnpm --filter @polyshore/calibration-worker start
```

For one-shot worker smoke checks:

```bash
WORKER_ONCE=true pnpm --filter @polyshore/scanner-worker start
WORKER_ONCE=true pnpm --filter @polyshore/research-worker start
WORKER_ONCE=true pnpm --filter @polyshore/execution-worker start
WORKER_ONCE=true pnpm --filter @polyshore/reconciliation-worker start
```

## Terminal Access

Set `NEXT_PUBLIC_TENANT_ID` to the tenant shown in the database seed/bootstrap data. The browser terminal calls protected API routes and needs `NEXT_PUBLIC_OPERATOR_API_KEY` set to a real API key scoped for the operator workflows you intend to use.

Do not expose a write-capable operator key from a public internet terminal. Keep the terminal behind SSO/VPN/reverse-proxy auth, or use a read-only API key for monitoring-only deployments.
