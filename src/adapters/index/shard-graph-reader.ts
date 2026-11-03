/** Call-graph queries on one repo shard: refs by name or by origin, and a file's package. */
import type { Repo } from '../../core/model/domain.types.ts';
import type { RefHit, RefKind } from '../../core/model/graph.types.ts';
import type { RefQuery } from '../../ports/index-store.ts';
import { int, text } from './rows.ts';
import type { SqlDb, SqlRow } from './sqlite.ts';

/* The origin is rebuilt from the symbol a ref points at ("" for top-level code). */
const REF_SELECT = `SELECT r.kind, n.text AS name, rc.text AS receiver, sc.text AS scope, r.line, f.path,
  CASE WHEN s.id IS NULL THEN '' WHEN s.container = '' THEN s.name ELSE s.container || '.' || s.name END AS origin
  FROM refs r JOIN files f ON f.id = r.file_id JOIN strings n ON n.id = r.name_id
  JOIN strings rc ON rc.id = r.receiver_id JOIN strings sc ON sc.id = r.scope_id
  LEFT JOIN symbols s ON s.id = r.symbol_id`;
const KINDS: ReadonlySet<string> = new Set(['call', 'new', 'render', 'extends', 'implements']);

function isRefKind(value: string): value is RefKind {
  return KINDS.has(value);
}

function toRefs(rows: readonly SqlRow[], repo: Repo): RefHit[] {
  return rows.flatMap((row) => {
    const kind = text(row, 'kind');
    if (!isRefKind(kind)) return [];
    return [
      {
        kind,
        name: text(row, 'name'),
        receiver: text(row, 'receiver'),
        scope: text(row, 'scope'),
        line: int(row, 'line'),
        origin: text(row, 'origin'),
        repo: repo.slug,
        path: text(row, 'path'),
      },
    ];
  });
}

export function refsNamed(db: SqlDb, repo: Repo, query: RefQuery): RefHit[] {
  if (query.kinds.length === 0) return [];
  const marks = query.kinds.map(() => '?').join(', ');
  const rows = db.all(
    `${REF_SELECT} WHERE r.name_id = (SELECT id FROM strings WHERE text = ?) AND r.kind IN (${marks}) ORDER BY f.path, r.line LIMIT ?`,
    [query.name, ...query.kinds, query.limit],
  );
  return toRefs(rows, repo);
}

/** Refs inside the definitions of a file named `origin` (overloads share one), or top-level ones. */
export function refsFrom(db: SqlDb, repo: Repo, at: { path: string; origin: string }): RefHit[] {
  const file = int(db.get('SELECT id FROM files WHERE path = ?', [at.path]), 'id');
  if (at.origin === '') {
    const rows = db.all(`${REF_SELECT} WHERE r.file_id = ? AND r.symbol_id = 0 ORDER BY r.line`, [
      file,
    ]);
    return toRefs(rows, repo);
  }
  const rows = db.all(
    `${REF_SELECT} WHERE r.file_id = ? AND r.symbol_id IN (SELECT id FROM symbols WHERE file_id = ? AND (CASE WHEN container = '' THEN name ELSE container || '.' || name END) = ?) ORDER BY r.line`,
    [file, file, at.origin],
  );
  return toRefs(rows, repo);
}

/** The package of an indexed file ("" outside Java and Kotlin), or null when it is not indexed. */
export function filePackage(db: SqlDb, path: string): string | null {
  const file = db.get('SELECT pkg FROM files WHERE path = ?', [path]);
  return file ? text(file, 'pkg') : null;
}
