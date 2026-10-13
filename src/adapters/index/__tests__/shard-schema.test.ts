import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from '../rows.ts';
import { ensureSchema, SCHEMA_VERSION } from '../shard-schema.ts';
import { loadSqlite } from '../sqlite.ts';

let dir = '';

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function shard(): string {
  dir = mkdtempSync(join(tmpdir(), 'codebase-mcp-schema-'));
  return join(dir, 'orders.sqlite');
}

test('a shard from another schema version is rebuilt', async () => {
  const open = await loadSqlite();
  const db = open(shard(), { readonly: false });
  db.exec(
    "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES ('schema_version', '0'); CREATE TABLE files (id INTEGER PRIMARY KEY, legacy TEXT);",
  );
  ensureSchema(db);
  expect(text(db.get("SELECT value FROM meta WHERE key = 'schema_version'"), 'value')).toBe(
    SCHEMA_VERSION,
  );
  expect(db.all('PRAGMA table_info(files)').map((row) => text(row, 'name'))).toContain(
    'fingerprint',
  );
  db.close();
});
