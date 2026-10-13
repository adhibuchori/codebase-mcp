/** Ports: the per-repo index (one SQLite shard per repo) as readers and the indexer see it. */
import type {
  Repo,
  RouteDef,
  RouteHit,
  RouteKind,
  SymbolDef,
  SymbolHit,
} from '../core/model/domain.types.ts';

type IndexState = 'missing' | 'queued' | 'indexing' | 'ready' | 'failed';

export interface IndexStatus {
  readonly state: IndexState;
  readonly files: number;
  readonly bytes: number;
  /** Epoch milliseconds of the last completed run, 0 when none. */
  readonly indexedAt: number;
  /** 0..1 while indexing. */
  readonly progress: number;
  readonly message: string;
}

export interface IndexedFile {
  readonly path: string;
  readonly lang: string;
  readonly size: number;
  readonly lines: number;
  readonly flags: number;
}

export interface SymbolQuery {
  readonly name: string;
  readonly match: 'exact' | 'prefix' | 'contains';
  readonly kind: string;
  readonly limit: number;
}

export interface IndexReader {
  status(repo: Repo): IndexStatus;
  /** Paths whose content holds every trigram of the FTS5 expression; null when the shard is unusable. */
  candidates(repo: Repo, match: string, limit: number): readonly string[] | null;
  files(repo: Repo): readonly IndexedFile[] | null;
  file(repo: Repo, path: string): IndexedFile | null;
  /** Paths whose file name equals `name` (case-insensitive); null when the shard is unusable. */
  pathsNamed(repo: Repo, name: string, limit: number): readonly string[] | null;
  /** Symbols of one file, or null when the file is not indexed. */
  symbolsInFile(repo: Repo, path: string): readonly SymbolDef[] | null;
  findSymbols(repo: Repo, query: SymbolQuery): readonly SymbolHit[];
  routes(repo: Repo, kinds: readonly RouteKind[]): readonly RouteHit[];
}

/** Everything the indexer stores about one file. */
export interface FileRecord {
  readonly path: string;
  /** "size:mtime"; a file is analysed again when it changes. */
  readonly fingerprint: string;
  readonly size: number;
  readonly lang: string;
  readonly lines: number;
  readonly flags: number;
  readonly content: string;
  readonly symbols: readonly SymbolDef[];
  readonly routes: readonly RouteDef[];
}

export interface IndexWriter {
  fingerprints(): ReadonlyMap<string, string>;
  remove(paths: readonly string[]): void;
  upsert(records: readonly FileRecord[]): void;
  setMeta(entries: Readonly<Record<string, string>>): void;
  close(): void;
}
