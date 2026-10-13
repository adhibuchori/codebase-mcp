/** Read queries on one repo shard. Pure functions over a read-only connection. */
import type {
  Repo,
  RouteHit,
  RouteKind,
  SymbolDef,
  SymbolHit,
} from '../../core/model/domain.types.ts';
import { trigramMatch } from '../../core/query/trigrams.ts';
import type { IndexedFile, IndexStatus, SymbolQuery } from '../../ports/index-store.ts';
import { int, text } from './rows.ts';
import type { SqlDb, SqlRow } from './sqlite.ts';

export function readStatus(db: SqlDb): IndexStatus {
  const meta = new Map(
    db.all('SELECT key, value FROM meta').map((row) => [text(row, 'key'), text(row, 'value')]),
  );
  const status = meta.get('status');
  const state =
    status === 'ready' || status === 'indexing' || status === 'failed' ? status : 'missing';
  return {
    state,
    files: Number(meta.get('files') ?? 0),
    bytes: Number(meta.get('bytes') ?? 0),
    indexedAt: Number(meta.get('indexed_at') ?? 0),
    progress: state === 'ready' ? 1 : 0,
    message: meta.get('message') ?? '',
  };
}

export function candidatePaths(db: SqlDb, match: string, limit: number): string[] {
  const rows = db.all(
    'SELECT path FROM files WHERE id IN (SELECT rowid FROM content WHERE content MATCH ? LIMIT ?)',
    [match, limit],
  );
  return rows.map((row) => text(row, 'path'));
}

export function pathsNamed(db: SqlDb, name: string, limit: number): string[] {
  return db
    .all('SELECT path FROM files WHERE name = ? COLLATE NOCASE LIMIT ?', [name, limit])
    .map((row) => text(row, 'path'));
}

function toFile(row: SqlRow): IndexedFile {
  return {
    path: text(row, 'path'),
    lang: text(row, 'lang'),
    size: int(row, 'size'),
    lines: int(row, 'lines'),
    flags: int(row, 'flags'),
  };
}

export function listFiles(db: SqlDb): IndexedFile[] {
  return db.all('SELECT path, lang, size, lines, flags FROM files ORDER BY path').map(toFile);
}

export function fileRow(db: SqlDb, path: string): IndexedFile | null {
  const row = db.get('SELECT path, lang, size, lines, flags FROM files WHERE path = ?', [path]);
  return row ? toFile(row) : null;
}

function toSymbol(row: SqlRow): SymbolDef {
  return {
    name: text(row, 'name'),
    kind: text(row, 'kind'),
    line: int(row, 'line'),
    endLine: int(row, 'end_line'),
    container: text(row, 'container'),
    signature: text(row, 'signature'),
  };
}

const SYMBOL_COLUMNS = 's.name, s.kind, s.line, s.end_line, s.container, s.signature, f.path';

export function symbolsOf(db: SqlDb, path: string): SymbolDef[] | null {
  const file = db.get('SELECT id FROM files WHERE path = ?', [path]);
  if (!file) return null;
  return db
    .all(
      `SELECT ${SYMBOL_COLUMNS} FROM symbols s JOIN files f ON f.id = s.file_id WHERE s.file_id = ? ORDER BY s.line`,
      [int(file, 'id')],
    )
    .map(toSymbol);
}

function symbolFilter(query: SymbolQuery): { where: string; params: (string | number)[] } {
  const kind = query.kind ? ' AND s.kind = ?' : '';
  const kindParams = query.kind ? [query.kind] : [];
  if (query.match === 'exact')
    return { where: `s.name = ? COLLATE NOCASE${kind}`, params: [query.name, ...kindParams] };
  if (query.match === 'prefix')
    return {
      where: `s.name LIKE ? ESCAPE '\\'${kind}`,
      params: [`${query.name.replace(/[\\%_]/g, '\\$&')}%`, ...kindParams],
    };
  /* detail=none cannot answer phrase queries: AND the trigrams, then confirm the substring. */
  const where = `s.id IN (SELECT rowid FROM symbol_names WHERE symbol_names MATCH ?) AND instr(lower(s.name), lower(?)) > 0${kind}`;
  return { where, params: [trigramMatch([query.name]), query.name, ...kindParams] };
}

export function findSymbols(db: SqlDb, repo: Repo, query: SymbolQuery): SymbolHit[] {
  if (query.match === 'contains' && query.name.length < 3) return [];
  const filter = symbolFilter(query);
  const sql = `SELECT ${SYMBOL_COLUMNS} FROM symbols s JOIN files f ON f.id = s.file_id WHERE ${filter.where} ORDER BY length(s.name), f.path LIMIT ?`;
  return db
    .all(sql, [...filter.params, query.limit])
    .map((row) => Object.assign(toSymbol(row), { repo: repo.slug, path: text(row, 'path') }));
}

export function routesOf(db: SqlDb, repo: Repo, kinds: readonly RouteKind[]): RouteHit[] {
  if (kinds.length === 0) return [];
  const marks = kinds.map(() => '?').join(', ');
  const rows = db.all(
    `SELECT r.kind, r.role, r.method, r.pattern, r.line, r.framework, f.path FROM routes r JOIN files f ON f.id = r.file_id WHERE r.kind IN (${marks})`,
    [...kinds],
  );
  return rows.flatMap((row) => {
    const kind = text(row, 'kind');
    const role = text(row, 'role');
    if (!isRouteKind(kind) || !isRouteRole(role)) return [];
    const { method, pattern, framework, path } = {
      method: text(row, 'method'),
      pattern: text(row, 'pattern'),
      framework: text(row, 'framework'),
      path: text(row, 'path'),
    };
    return [
      { kind, role, method, pattern, line: int(row, 'line'), framework, repo: repo.slug, path },
    ];
  });
}

function isRouteKind(value: string): value is RouteKind {
  return value === 'http' || value === 'grpc' || value === 'topic' || value === 'client';
}

function isRouteRole(value: string): value is RouteHit['role'] {
  return ['handler', 'caller', 'producer', 'consumer', 'definition'].includes(value);
}
