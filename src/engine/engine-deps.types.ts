/** What the application layer needs from the outside world: ports only, wired in src/app-deps.ts. */
import type { FileSystem } from '../ports/file-system.ts';
import type { GitReader } from '../ports/git.ts';
import type { IndexReader } from '../ports/index-store.ts';
import type {
  Clock,
  LanguageRegistry,
  Logger,
  RepoRegistry,
  SymbolParser,
} from '../ports/runtime.ts';
import type { Inventory, TextSearcher } from '../ports/search.ts';

interface Limits {
  readonly maxResponseChars: number;
  readonly maxFileBytes: number;
  readonly searchTimeoutMs: number;
  readonly maxReadLines: number;
}

export interface EngineDeps {
  readonly repos: RepoRegistry;
  readonly fs: FileSystem;
  readonly index: IndexReader;
  readonly inventory: Inventory;
  /** ripgrep, or null when it cannot run on this machine. */
  readonly rg: TextSearcher | null;
  readonly js: TextSearcher;
  readonly git: GitReader;
  readonly parser: SymbolParser;
  readonly languages: LanguageRegistry;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly limits: Limits;
  /** Extra sensitive-name patterns from the config. */
  readonly blocked: readonly RegExp[];
  /** Extra logger names (in-house wrappers) that mark a log statement. */
  readonly loggerNames: readonly string[];
}
