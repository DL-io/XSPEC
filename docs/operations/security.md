# Security Operations

- Never log credentials; use `sanitizeForLog` for structured context.
- Store credentials encrypted at rest.
- Require RBAC for all terminal actions.
- Require dual confirmation for live activation.
- Use parameterized Drizzle queries only.
- Keep decision audit records append-only except approved calibration backfill fields.
