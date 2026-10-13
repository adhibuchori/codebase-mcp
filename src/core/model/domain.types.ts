/**
 * The vocabulary every layer shares: repos, matches, symbols, routes and stack frames.
 * Type-only, so the runtime never loads it (bunfig.toml coverage exemption for *.types.ts).
 */

/** A repository the server may read. `slug` is unique and never contains a slash. */
export interface Repo {
  readonly slug: string;
  /** Absolute real path of the repo root (symlinks resolved). */
  readonly root: string;
  /** Group name derived from the folder layout, or "" when the repo has none. */
  readonly group: string;
}

export type MatchMode = 'literal' | 'regex' | 'word';

/** One matching line. `path` is repo-relative with forward slashes; `line` and `column` start at 1. */
export interface TextMatch {
  readonly repo: string;
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly text: string;
}

export type SearchEngineName = 'index' | 'ripgrep' | 'scan';

export interface SearchResult {
  readonly matches: readonly TextMatch[];
  readonly filesSearched: number;
  readonly truncated: boolean;
  readonly timedOut: boolean;
  readonly engines: readonly SearchEngineName[];
}

/** A definition found by tree-sitter or by a language pack's regex fallback. */
export interface SymbolDef {
  readonly name: string;
  readonly kind: string;
  readonly line: number;
  readonly endLine: number;
  /** Dotted name of the enclosing definition, or "" at the top level. */
  readonly container: string;
  readonly signature: string;
}

export interface SymbolHit extends SymbolDef {
  readonly repo: string;
  readonly path: string;
}

export type RouteKind = 'http' | 'grpc' | 'topic' | 'client';
type RouteRole = 'handler' | 'caller' | 'producer' | 'consumer' | 'definition';

/** An endpoint, gRPC method, message topic or outgoing call declared in source. */
export interface RouteDef {
  readonly kind: RouteKind;
  readonly role: RouteRole;
  /** HTTP verb, "RPC" for gRPC, or "" for topics. */
  readonly method: string;
  /** Path template, "Service/Method", or topic name, exactly as written in source. */
  readonly pattern: string;
  readonly line: number;
  readonly framework: string;
}

export interface RouteHit extends RouteDef {
  readonly repo: string;
  readonly path: string;
}

/** One frame of a stack trace, as printed by the runtime. */
export interface StackFrame {
  readonly raw: string;
  /** File as printed (may be absolute, module-qualified or just a name); "" when unknown. */
  readonly file: string;
  readonly line: number;
  readonly func: string;
  /** Repo-relative path suffix to look for, e.g. "com/acme/orders/OrderService.java". */
  readonly pathHint: string;
}

export interface ParsedTrace {
  readonly runtime: string;
  /** The error message(s) the trace carries, outermost first. */
  readonly messages: readonly string[];
  readonly frames: readonly StackFrame[];
}
