/** Messages between the server and the indexer worker threads. Plain data: structured-clone safe. */
import type { Repo } from '../core/model/domain.types.ts';

export interface IndexSettings {
  readonly indexDir: string;
  readonly maxFileBytes: number;
  /** Extra sensitive-name regexes, as source strings. */
  readonly blocked: readonly string[];
  /** Globs of files never indexed. */
  readonly exclude: readonly string[];
  readonly grammarsDir: string;
  readonly queriesDir: string;
  readonly gitEnv: Readonly<Record<string, string>>;
  readonly gitTimeoutMs: number;
}

export interface IndexOutcome {
  readonly files: number;
  readonly bytes: number;
  readonly changed: number;
  readonly removed: number;
  readonly ms: number;
}

export interface IndexJobMessage {
  readonly type: 'index';
  readonly id: number;
  readonly repo: Repo;
  readonly settings: IndexSettings;
}

export type WorkerReply =
  | {
      readonly type: 'progress';
      readonly id: number;
      readonly done: number;
      readonly total: number;
    }
  | { readonly type: 'done'; readonly id: number; readonly outcome: IndexOutcome }
  | { readonly type: 'failed'; readonly id: number; readonly message: string };

/** Runs one index job, in a worker thread or inline. */
export interface IndexJobRunner {
  run(repo: Repo, onProgress: (done: number, total: number) => void): Promise<IndexOutcome>;
  close(): Promise<void>;
}
