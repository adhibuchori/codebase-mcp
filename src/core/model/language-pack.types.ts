/**
 * The contract a language pack fulfils. Adding a language means adding one folder under
 * src/languages/ that exports a LanguagePack; nothing in core/ or engine/ changes.
 */
import type { ParsedTrace, RouteDef } from './domain.types.ts';

/** A regular expression whose first capture group is the symbol name (tier 3 fallback). */
export interface SymbolPattern {
  readonly kind: string;
  readonly regex: RegExp;
}

/** Marks a repo as using a framework when a build file contains a pattern. */
export interface FrameworkRule {
  readonly file: RegExp;
  readonly contains: RegExp;
  readonly name: string;
}

export type RouteExtractor = (text: string) => RouteDef[];
export type StackParser = (text: string) => ParsedTrace | null;

export interface LanguagePack {
  readonly id: string;
  readonly name: string;
  /** 1: symbols, stack traces, logs and routes. 2: symbols. 3: search with regex symbols. */
  readonly tier: 1 | 2 | 3;
  readonly extensions: readonly string[];
  readonly fileNames?: readonly string[];
  /** Grammar id: assets/grammars/<id>.wasm with its query at assets/queries/<id>.scm. */
  readonly grammar?: string;
  readonly symbolPatterns?: readonly SymbolPattern[];
  readonly routeExtractors?: readonly RouteExtractor[];
  readonly frameworks?: readonly FrameworkRule[];
  /** Matches the source line of a log or throw statement, used to rank log-source candidates. */
  readonly logCall?: RegExp;
}
