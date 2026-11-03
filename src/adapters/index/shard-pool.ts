/**
 * IndexReader over many repo shards. Read-only connections are kept in a small LRU, so hundreds of
 * repos never hold hundreds of open files. Live state from the indexer (queued, indexing, progress)
 * overrides what the shard says about itself.
 */
import type { Repo } from '../../core/model/domain.types.ts';
import type { IndexReader, IndexStatus } from '../../ports/index-store.ts';
import {
  candidatePaths,
  fileRow,
  findSymbols,
  listFiles,
  pathsNamed,
  readStatus,
  routesOf,
  symbolsOf,
} from './shard-reader.ts';
import { filePackage, refsFrom, refsNamed } from './shard-graph-reader.ts';
import { SCHEMA_VERSION, schemaVersion } from './shard-schema.ts';
import type { OpenSqlite, SqlDb } from './sqlite.ts';

export interface ShardPoolDeps {
  readonly open: OpenSqlite;
  readonly shardPath: (repo: Repo) => string;
  readonly exists: (path: string) => boolean;
  readonly liveStatus: (slug: string) => IndexStatus | undefined;
  readonly maxOpen: number;
}

export interface ShardPool extends IndexReader {
  /** Drops the cached connection, after the indexer rebuilt a shard. */
  invalidate(slug: string): void;
  closeAll(): void;
}

/**
 * How many shards stay open: every repo plus a margin, between 48 and 512. A search or a call-graph
 * lookup asks every shard; with 369 repos and only 48 open, each one reopened ~320 files, and a
 * callers answer took 462 ms instead of 22 ms (measured). Bun and Node raise the open-file limit at
 * start, and a read-only WAL shard holds three handles.
 */
export function shardPoolSize(repoCount: number): number {
  return Math.min(512, Math.max(48, repoCount + 16));
}

const MISSING: IndexStatus = {
  state: 'missing',
  files: 0,
  bytes: 0,
  indexedAt: 0,
  progress: 0,
  message: '',
};

function connectionCache(deps: ShardPoolDeps) {
  const open = new Map<string, SqlDb>();
  const evict = (): void => {
    const oldest = open.keys().next();
    if (oldest.done) return;
    open.get(oldest.value)?.close();
    open.delete(oldest.value);
  };
  const connect = (repo: Repo): SqlDb | null => {
    const cached = open.get(repo.slug);
    if (cached) {
      open.delete(repo.slug);
      open.set(repo.slug, cached);
      return cached;
    }
    if (!deps.exists(deps.shardPath(repo))) return null;
    const db = deps.open(deps.shardPath(repo), { readonly: true });
    open.set(repo.slug, db);
    if (open.size > deps.maxOpen) evict();
    return db;
  };
  const invalidate = (slug: string): void => {
    open.get(slug)?.close();
    open.delete(slug);
  };
  const closeAll = (): void => {
    for (const db of open.values()) db.close();
    open.clear();
  };
  return { connect, invalidate, closeAll };
}

export function createShardPool(deps: ShardPoolDeps): ShardPool {
  const cache = connectionCache(deps);
  const checked = new WeakSet<SqlDb>();
  const current = (db: SqlDb): boolean => {
    if (checked.has(db)) return true;
    if (schemaVersion(db) !== SCHEMA_VERSION) return false;
    checked.add(db);
    return true;
  };
  /**
   * A shard is usable once it completed at least one run, even while a refresh is running, and only
   * in the current schema: after an upgrade, an old shard is not read until its rebuild.
   */
  const usable = (repo: Repo): SqlDb | null => {
    const db = cache.connect(repo);
    if (!db || !current(db)) return null;
    if (deps.liveStatus(repo.slug)?.state === 'ready') return db;
    return readStatus(db).indexedAt > 0 ? db : null;
  };
  const withShard = <T>(repo: Repo, read: (db: SqlDb) => T, fallback: T): T => {
    const db = usable(repo);
    return db ? read(db) : fallback;
  };
  return {
    status: (repo) => deps.liveStatus(repo.slug) ?? withShard(repo, readStatus, MISSING),
    candidates: (repo, match, limit) =>
      withShard<readonly string[] | null>(repo, (db) => candidatePaths(db, match, limit), null),
    files: (repo) => withShard<ReturnType<typeof listFiles> | null>(repo, listFiles, null),
    file: (repo, path) => withShard(repo, (db) => fileRow(db, path), null),
    pathsNamed: (repo, name, limit) =>
      withShard<readonly string[] | null>(repo, (db) => pathsNamed(db, name, limit), null),
    symbolsInFile: (repo, path) => withShard(repo, (db) => symbolsOf(db, path), null),
    findSymbols: (repo, query) => withShard(repo, (db) => findSymbols(db, repo, query), []),
    routes: (repo, kinds) => withShard(repo, (db) => routesOf(db, repo, kinds), []),
    refsNamed: (repo, query) => withShard(repo, (db) => refsNamed(db, repo, query), []),
    refsFrom: (repo, path, origin) =>
      withShard(repo, (db) => refsFrom(db, repo, { path, origin }), []),
    filePackage: (repo, path) => withShard(repo, (db) => filePackage(db, path), null),
    invalidate: cache.invalidate,
    closeAll: cache.closeAll,
  };
}
