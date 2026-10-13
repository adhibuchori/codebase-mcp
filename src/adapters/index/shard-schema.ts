/**
 * One SQLite shard per repo: file list with fingerprints, a contentless trigram index of every text
 * file (≈ 26 % of the source size, measured), symbols with a trigram index of their names, and
 * routes. A shard from another schema version is dropped and rebuilt.
 */
import { text } from './rows.ts';
import type { SqlDb } from './sqlite.ts';

export const SCHEMA_VERSION = '1';

const TABLES = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, fingerprint TEXT NOT NULL,
  size INTEGER NOT NULL, lang TEXT NOT NULL, lines INTEGER NOT NULL, flags INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS files_by_name ON files (name COLLATE NOCASE);
CREATE VIRTUAL TABLE IF NOT EXISTS content USING fts5(
  body, tokenize = 'trigram', content = '', contentless_delete = 1, detail = 'none'
);
CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
  line INTEGER NOT NULL, end_line INTEGER NOT NULL, container TEXT NOT NULL, signature TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS symbols_by_file ON symbols (file_id, line);
CREATE INDEX IF NOT EXISTS symbols_by_name ON symbols (name COLLATE NOCASE);
CREATE VIRTUAL TABLE IF NOT EXISTS symbol_names USING fts5(
  name, tokenize = 'trigram', content = '', contentless_delete = 1, detail = 'none'
);
CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL, kind TEXT NOT NULL, role TEXT NOT NULL,
  method TEXT NOT NULL, pattern TEXT NOT NULL, line INTEGER NOT NULL, framework TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS routes_by_file ON routes (file_id);
CREATE INDEX IF NOT EXISTS routes_by_kind ON routes (kind);
`;

const DROP = ['meta', 'files', 'content', 'symbols', 'symbol_names', 'routes']
  .map((t) => `DROP TABLE IF EXISTS ${t};`)
  .join('\n');

function currentVersion(db: SqlDb): string {
  const exists = db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'");
  return exists ? text(db.get("SELECT value FROM meta WHERE key = 'schema_version'"), 'value') : '';
}

/** Creates the tables, or recreates them when the shard was written by another schema version. */
export function ensureSchema(db: SqlDb): void {
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
  const version = currentVersion(db);
  if (version !== '' && version !== SCHEMA_VERSION) db.exec(DROP);
  db.exec(TABLES);
  db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [
    'schema_version',
    SCHEMA_VERSION,
  ]);
}
