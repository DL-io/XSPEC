import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

export type OmegaDb = ReturnType<typeof createDb>;

export function createDb(databaseUrl: string) {
  const pool = mysql.createPool({
    uri: databaseUrl,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true
  });
  return drizzle(pool, { schema, mode: 'default' });
}
