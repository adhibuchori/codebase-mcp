/**
 * Writes one file's call graph into its shard. To keep the index small, a ref names its definition
 * by symbol id instead of repeating "Class.method", and its name, receiver and scope through the
 * `strings` table, since one repo uses the same few names and types again and again. Imports are
 * not stored: they are resolved into the scopes at index time.
 */
import type { FileGraph } from '../../core/model/graph.types.ts';
import { int } from './rows.ts';
import type { SqlDb } from './sqlite.ts';

function stringId(db: SqlDb, value: string, known: Map<string, number>): number {
  const cached = known.get(value);
  if (cached !== undefined) return cached;
  db.run('INSERT OR IGNORE INTO strings (text) VALUES (?)', [value]);
  const id = int(db.get('SELECT id FROM strings WHERE text = ?', [value]), 'id');
  known.set(value, id);
  return id;
}

/** `symbols` maps "Class.method" to the id of that definition in this file. */
export function saveGraph(
  db: SqlDb,
  file: { readonly id: number; readonly graph: FileGraph },
  symbols: ReadonlyMap<string, number>,
): void {
  const known = new Map<string, number>();
  const id = (value: string): number => stringId(db, value, known);
  for (const r of file.graph.refs) {
    db.run(
      'INSERT INTO refs (file_id, kind, name_id, receiver_id, scope_id, line, symbol_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        file.id,
        r.kind,
        id(r.name),
        id(r.receiver),
        id(r.scope),
        r.line,
        symbols.get(r.origin) ?? 0,
      ],
    );
  }
}
