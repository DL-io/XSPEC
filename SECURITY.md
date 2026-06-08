# SECURITY

## Secrets

- Do not commit `.env`, `.env.*`, logs, generated builds, or dependency folders.
- Do not log private keys, API secrets, passphrases, JWT/session secrets, encryption keys, or raw environment dumps.
- `pnpm validate-config` reports configured keys and readiness, not secret values.

## API Access

Protected API routes require `x-api-key` or `Authorization: Bearer <key>`.

The browser terminal can send `NEXT_PUBLIC_OPERATOR_API_KEY`. Because `NEXT_PUBLIC_*` values are visible to users of the browser app, do not expose a write-capable key on a public internet terminal. Use network controls, SSO/VPN/reverse-proxy auth, and least-privilege API scopes.

## Live Trading

Live mode fails closed unless:

- `OPERATING_MODE=live`
- `LIVE_TRADING_ENABLED=true`
- `KILLSWITCH_ARMED=true`
- Polymarket signing and L2 credentials are configured
- Database and Redis are reachable
- Required workers are heartbeating
- Reconciliation is clear
- Operator live authorization is enabled

## Webhooks

Webhook URLs must use HTTPS and cannot target localhost or private network addresses. This prevents SSRF through alert sinks.

## Operational Controls

- Keep kill switch active until paper mode is verified.
- Use separate API keys for read-only monitoring and risk-management actions.
- Rotate any credential that was ever pasted into logs, screenshots, or shared terminals.
