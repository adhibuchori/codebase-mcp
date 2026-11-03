/**
 * One SQLite shard per repo: file list with fingerprints, a contentless trigram index of every text
 * file (≈ 26 % of the source size, measured), symbols with a trigram index of their names, routes,
 * and the call graph (each file's package and refs, their texts interned in `strings`). A shard from another schema version
 * is dropped and rebuilt.
 */
import { text } from './rows.ts';
import type { SqlDb } from './sqlite.ts';

export const SCHEMA_VERSION = '2';

const TABLES = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, fingerprint TEXT NOT NULL,
  size INTEGER NOT NULL, lang TEXT NOT NULL, lines INTEGER NOT NULL, flags INTEGER NOT NULL,
  pkg TEXT NOT NULL DEFAULT ''
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
CREATE TABLE IF NOT EXISTS strings (id INTEGER PRIMARY KEY, text TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS refs (
  id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL, kind TEXT NOT NULL, name_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL, scope_id INTEGER NOT NULL, line INTEGER NOT NULL,
  symbol_id INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS refs_by_name ON refs (name_id);
CREATE INDEX IF NOT EXISTS refs_by_file ON refs (file_id, symbol_id);
`;

const DROP = ['meta', 'files', 'content', 'symbols', 'symbol_names', 'routes', 'strings', 'refs']
  .map((t) => `DROP TABLE IF EXISTS ${t};`)
  .join('\n');

/** The schema a shard was written with, "" for a new or empty file. */
export function schemaVersion(db: SqlDb): string {
  const exists = db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'");
  return exists ? text(db.get("SELECT value FROM meta WHERE key = 'schema_version'"), 'value') : '';
}

/** Creates the tables, or recreates them when the shard was written by another schema version. */
export function ensureSchema(db: SqlDb): void {
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
  const version = schemaVersion(db);
  if (version !== '' && version !== SCHEMA_VERSION) db.exec(DROP);
  db.exec(TABLES);
  db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [
    'schema_version',
    SCHEMA_VERSION,
  ]);
}
