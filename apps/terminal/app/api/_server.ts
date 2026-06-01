import { loadConfig } from '@polyshore/config';
import { createDb } from '@polyshore/db';

export function getDb() {
  const config = loadConfig();
  return createDb(config.DATABASE_URL);
}

export function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}
