# Deployment Runbook

## Railway

1. Provision MySQL or TiDB and Redis.
2. Set `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, venue credentials, and alert channel variables.
3. Deploy with the root `railway.toml`.
4. Run `pnpm preflight` before enabling live mode.

The production path does not require Docker or Docker Compose.

## Self-hosted

1. Install Node.js 20+, pnpm, PM2, MySQL/TiDB, Redis, and Nginx.
2. Run `pnpm install --frozen-lockfile`.
3. Run `pnpm build` and `pnpm preflight`.
4. Start processes with `pm2 start ecosystem.config.cjs`.
5. Put Nginx in front of the terminal process and enable TLS.
