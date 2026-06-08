# ENVIRONMENT

The app validates env vars through `packages/config`. `.env`, `.env.*`, logs, generated builds, and dependency folders are gitignored.

## Required Base Vars

- `NODE_ENV`: `development`, `test`, or `production`
- `OPERATING_MODE`: `paper` or `live`
- `DATABASE_URL`: MySQL-compatible database URL
- `REDIS_URL`: `redis://` or `rediss://` URL
- `SESSION_SECRET`: at least 32 characters
- `ENCRYPTION_KEY`: at least 32 characters
- `NEXT_PUBLIC_TENANT_ID`: tenant id used by the browser terminal
- `NEXT_PUBLIC_OPERATOR_API_KEY`: API key sent by the browser terminal to protected API routes

## Polymarket

- `POLYMARKET_GAMMA_URL`
- `POLYMARKET_CLOB_URL`
- `POLYMARKET_PRIVATE_KEY`
- `POLYMARKET_API_KEY`
- `POLYMARKET_SECRET`
- `POLYMARKET_PASSPHRASE`
- `POLYMARKET_FUNDER_ADDRESS`
- `POLYMARKET_SIGNATURE_TYPE`
- `POLYMARKET_CHAIN_ID`
- `LIVE_TRADING_ENABLED`
- `KILLSWITCH_ARMED`

Live mode is rejected unless the live readiness map is complete. Credentials alone do not prove live readiness; reconciliation, balances, allowances, worker health, and operator authorization must also pass.

## Kalshi

- `KALSHI_API_URL`
- `KALSHI_KEY_ID`
- `KALSHI_PRIVATE_KEY`

Kalshi credentials are optional unless using authenticated Kalshi operations. If one Kalshi credential is set, both key id and PEM private key must be valid.

## Research Providers

- `TAVILY_API_KEY`
- `RESEARCH_PROVIDERS_REQUIRED`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GROQ_API_KEY`

When `OLLAMA_BASE_URL` is configured, Ollama is the preferred reasoning provider. `OLLAMA_MODEL` defaults to `gpt-oss:120b`; use a smaller installed model if the host cannot run it.

## Runtime Cadence

- `STRICT_RESOLUTION_MODE`
- `WATCHLIST_POLL_SECONDS`
- `ACTIVE_MARKET_POLL_SECONDS`
- `RECONCILIATION_SECONDS`

## Alerts And API Hardening

- `ALERT_WEBHOOK_URL`
- `SMTP_URL`
- `SMS_WEBHOOK_URL`
- `ALLOWED_ORIGINS`
- `TRUST_OPERATOR_ROLE_HEADERS`
- `TRUSTED_PROXY_HOPS`

`TRUST_OPERATOR_ROLE_HEADERS=true` is only for local non-production use. Production API access requires API keys and Redis-backed rate limiting.
