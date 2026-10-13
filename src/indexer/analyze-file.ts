/**
 * Everything the index stores about one text file: language, kind flags, line count, symbols and
 * routes. Generated, vendored and minified files are searchable but get no symbols or routes, so
 * they never outrank the code that people wrote.
 */
import type { RouteDef, SymbolDef } from '../core/model/domain.types.ts';
import {
  classifyPath,
  FLAG_GENERATED,
  FLAG_VENDOR,
  hasGeneratedHeader,
} from '../core/rank/classify.ts';
import type { LanguageRegistry, SymbolParser } from '../ports/runtime.ts';

export interface Analysis {
  readonly lang: string;
  readonly lines: number;
  readonly flags: number;
  readonly symbols: readonly SymbolDef[];
  readonly routes: readonly RouteDef[];
}

export interface AnalyzeDeps {
  readonly languages: LanguageRegistry;
  readonly parser: SymbolParser;
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  let lines = 1;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) lines++;
  return text.endsWith('\n') ? lines - 1 : lines;
}

function routesOf(extractors: readonly ((text: string) => RouteDef[])[], text: string): RouteDef[] {
  return extractors.flatMap((extract) => {
    try {
      return extract(text);
    } catch {
      return [];
    }
  });
}

export async function analyzeFile(
  path: string,
  text: string,
  deps: AnalyzeDeps,
): Promise<Analysis> {
  const pack = deps.languages.forPath(path);
  const flags = classifyPath(path) | (hasGeneratedHeader(text) ? FLAG_GENERATED : 0);
  const lines = countLines(text);
  const skip =
    !pack ||
    (flags & (FLAG_GENERATED | FLAG_VENDOR)) !== 0 ||
    text.length / Math.max(1, lines) > 400;
  if (skip) return { lang: pack?.id ?? 'text', lines, flags, symbols: [], routes: [] };
  const symbols = await deps.parser.parse(pack, text);
  return {
    lang: pack.id,
    lines,
    flags,
    symbols,
    routes: routesOf(pack.routeExtractors ?? [], text),
  };
}
