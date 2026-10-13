/**
 * IndexWriter on a repo shard. A changed file's old rows (content, symbols, names, routes) are
 * deleted before the new ones go in, all inside one transaction per batch, so a reader never sees a
 * half-written file.
 */
import type { FileRecord, IndexWriter } from '../../ports/index-store.ts';
import { int, text } from './rows.ts';
import { ensureSchema } from './shard-schema.ts';
import type { OpenSqlite, SqlDb } from './sqlite.ts';

/** Runs work in one write transaction, rolled back when it throws. */
export function transaction(db: Pick<SqlDb, 'exec'>, work: () => void): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    work();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function clearFile(db: SqlDb, id: number): void {
  db.run('DELETE FROM content WHERE rowid = ?', [id]);
  db.run('DELETE FROM symbol_names WHERE rowid IN (SELECT id FROM symbols WHERE file_id = ?)', [
    id,
  ]);
  db.run('DELETE FROM symbols WHERE file_id = ?', [id]);
  db.run('DELETE FROM routes WHERE file_id = ?', [id]);
}

function saveFile(db: SqlDb, record: FileRecord): number {
  const existing = int(db.get('SELECT id FROM files WHERE path = ?', [record.path]), 'id');
  if (existing > 0) clearFile(db, existing);
  const values = [record.fingerprint, record.size, record.lang, record.lines, record.flags];
  if (existing > 0) {
    db.run(
      'UPDATE files SET fingerprint = ?, size = ?, lang = ?, lines = ?, flags = ? WHERE id = ?',
      [...values, existing],
    );
    return existing;
  }
  const name = record.path.slice(record.path.lastIndexOf('/') + 1);
  const row = db.get(
    'INSERT INTO files (path, name, fingerprint, size, lang, lines, flags) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
    [record.path, name, ...values],
  );
  return int(row, 'id');
}

function saveDetails(db: SqlDb, id: number, record: FileRecord): void {
  db.run('INSERT INTO content (rowid, body) VALUES (?, ?)', [id, record.content]);
  for (const s of record.symbols) {
    const row = db.get(
      'INSERT INTO symbols (file_id, name, kind, line, end_line, container, signature) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
      [id, s.name, s.kind, s.line, s.endLine, s.container, s.signature],
    );
    db.run('INSERT INTO symbol_names (rowid, name) VALUES (?, ?)', [int(row, 'id'), s.name]);
  }
  for (const r of record.routes) {
    db.run(
      'INSERT INTO routes (file_id, kind, role, method, pattern, line, framework) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, r.kind, r.role, r.method, r.pattern, r.line, r.framework],
    );
  }
}

export function openShardWriter(open: OpenSqlite, path: string): IndexWriter {
  const db = open(path, { readonly: false });
  ensureSchema(db);
  let changes = 0;
  return {
    fingerprints: () =>
      new Map(
        db
          .all('SELECT path, fingerprint FROM files')
          .map((row) => [text(row, 'path'), text(row, 'fingerprint')]),
      ),
    remove: (paths) =>
      transaction(db, () => {
        for (const file of paths) {
          const id = int(db.get('SELECT id FROM files WHERE path = ?', [file]), 'id');
          if (id > 0) clearFile(db, id);
          db.run('DELETE FROM files WHERE id = ?', [id]);
        }
        changes += paths.length;
      }),
    upsert: (records) =>
      transaction(db, () => {
        for (const record of records) saveDetails(db, saveFile(db, record), record);
        changes += records.length;
      }),
    setMeta: (entries) => {
      for (const [key, value] of Object.entries(entries))
        db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
    },
    close: () => {
      if (changes > 500)
        db.exec(
          "INSERT INTO content (content) VALUES ('optimize'); INSERT INTO symbol_names (symbol_names) VALUES ('optimize');",
        );
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      db.close();
    },
  };
}
