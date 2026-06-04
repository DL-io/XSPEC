import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schemaPath = new URL('./schema.ts', import.meta.url);
const migrationsDir = new URL('../migrations/', import.meta.url);

function schemaTableNames(): string[] {
  const schemaSource = readFileSync(schemaPath, 'utf8');
  return [...schemaSource.matchAll(/export const \w+ = mysqlTable\('([^']+)'/g)]
    .map((match) => match[1])
    .sort();
}

function migrationSql(): string {
  expect(existsSync(migrationsDir)).toBe(true);
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  expect(files.length).toBeGreaterThan(0);
  return files.map((file) => readFileSync(new URL(file, migrationsDir), 'utf8')).join('\n');
}

describe('db migrations', () => {
  it('contains a CREATE TABLE statement for every schema table', () => {
    const expectedTables = schemaTableNames();
    const createdTables = [...migrationSql().matchAll(/CREATE TABLE `([^`]+)`/g)]
      .map((match) => match[1])
      .sort();

    expect(createdTables).toEqual(expectedTables);
  });

  it('keeps the generated migration journal present', () => {
    expect(existsSync(new URL('../migrations/meta/_journal.json', import.meta.url))).toBe(true);
  });
});
