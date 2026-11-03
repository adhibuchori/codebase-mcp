/** Ports: logging, time, the repo registry, the language registry and symbol parsing. */
import type { ParsedTrace, Repo, SymbolDef } from '../core/model/domain.types.ts';
import type { FileGraph } from '../core/model/graph.types.ts';
import type { LanguagePack } from '../core/model/language-pack.types.ts';

export type LogFields = Readonly<Record<string, string | number | boolean>>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export interface Clock {
  now(): number;
}

export interface RepoRegistry {
  list(): readonly Repo[];
  get(slug: string): Repo | undefined;
}

export interface LanguageRegistry {
  forPath(path: string): LanguagePack | undefined;
  all(): readonly LanguagePack[];
  /** The stack trace in the text, parsed by whichever runtime's parser finds the most frames. */
  parseTrace(text: string): ParsedTrace | null;
}

export interface ParsedFile {
  readonly symbols: readonly SymbolDef[];
  readonly graph: FileGraph;
}

export interface SymbolParser {
  parse(pack: LanguagePack, text: string): Promise<readonly SymbolDef[]>;
  /** Symbols and call graph from one parse; the indexer's entry point. */
  analyze(pack: LanguagePack, text: string): Promise<ParsedFile>;
}
