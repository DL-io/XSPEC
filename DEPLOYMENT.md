# DEPLOYMENT

## Railway

`railway.toml` builds the repo with:

```bash
pnpm install --frozen-lockfile && pnpm build
```

and starts the terminal with:

```bash
pnpm --filter @polyshore/terminal start
```

Provision separate Railway services for each worker using these start commands:

```bash
pnpm --filter @polyshore/scanner-worker start
pnpm --filter @polyshore/research-worker start
pnpm --filter @polyshore/execution-worker start
pnpm --filter @polyshore/reconciliation-worker start
pnpm --filter @polyshore/alert-worker start
pnpm --filter @polyshore/calibration-worker start
```

Attach MySQL/TiDB and Redis-compatible services, set every required env var from `ENVIRONMENT.md`, then run:

```bash
pnpm db:migrate
pnpm preflight
```

Health checks:

- Public process health: `GET /api/health`
- Authenticated dependency health: `GET /api/health?tenantId=<tenant>` with `x-api-key`

## Local Production With PM2

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm db:migrate
pm2 start ecosystem.config.cjs
pm2 status
```

## Local Production With systemd

Use `docs/operations/systemd.service` as the terminal service template and create matching worker services by changing the `ExecStart` command to the worker start commands above.

Put nginx or another reverse proxy in front of the terminal. `docs/operations/nginx.conf` is a starting point; update hostnames, TLS, and upstream port for the deployment.

## Deployment Gate

Before declaring the deployment usable:

```bash
pnpm validate-config
pnpm db:check
pnpm preflight
SMOKE_START_SERVER=true PORT=56550 pnpm smoke
```

Only run `SMOKE_WORKERS=true pnpm smoke` when the environment points at real reachable database and Redis dependencies.
