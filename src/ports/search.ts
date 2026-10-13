/** Ports: text search (ripgrep or the JavaScript scanner) and the file inventory of a repo. */
import type {
  MatchMode,
  Repo,
  SearchEngineName,
  SearchResult,
} from '../core/model/domain.types.ts';

export interface TextQuery {
  readonly pattern: string;
  readonly mode: MatchMode;
  readonly caseSensitive: boolean;
  /** Glob over repo-relative paths, as the user wrote it ("" for all files). */
  readonly pathGlob: string;
  readonly maxMatches: number;
  readonly maxPerFile: number;
  /** Epoch milliseconds after which the searcher stops and reports what it has. */
  readonly deadline: number;
}

export interface TextSearcher {
  readonly name: SearchEngineName;
  /** Searches every readable file of the repos. */
  scan(repos: readonly Repo[], query: TextQuery): Promise<SearchResult>;
  /** Searches only the listed repo-relative files of each repo. */
  verify(candidates: ReadonlyMap<Repo, readonly string[]>, query: TextQuery): Promise<SearchResult>;
}

export interface InventoryEntry {
  /** Repo-relative path with forward slashes. */
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
}

/** Lists the readable files of a repo: tracked and untracked-but-not-ignored, no sensitive names. */
export interface Inventory {
  list(repo: Repo): Promise<readonly InventoryEntry[]>;
}
