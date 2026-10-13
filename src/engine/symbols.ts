/**
 * Symbols for the tools: from the index when the file is indexed, otherwise parsed on the spot with
 * the same parser the indexer uses, so outlines and enclosing-symbol labels work before indexing ends.
 */
import type { Repo, SymbolDef, SymbolHit } from '../core/model/domain.types.ts';
import { enclosingSymbol } from '../core/symbols/symbol-tree.ts';
import type { SymbolQuery } from '../ports/index-store.ts';
import type { EngineDeps } from './engine-deps.types.ts';
import type { SafeFile } from './file-access.ts';

type SymbolDeps = Pick<EngineDeps, 'index' | 'languages' | 'parser'>;

export async function symbolsOfFile(
  deps: SymbolDeps,
  file: SafeFile,
  lines: () => Promise<readonly string[]>,
): Promise<readonly SymbolDef[]> {
  const indexed = deps.index.symbolsInFile(file.repo, file.path);
  if (indexed) return indexed;
  const pack = deps.languages.forPath(file.path);
  return pack ? deps.parser.parse(pack, (await lines()).join('\n')) : [];
}

/** Lines of a file that define a symbol with this name (exact, case-insensitive), from the index. */
export interface FileSpot {
  readonly repo: Repo;
  readonly path: string;
}

export function definitionLines(
  deps: Pick<EngineDeps, 'index'>,
  at: FileSpot,
  name: string,
): Set<number> {
  const wanted = name.toLowerCase();
  const symbols = deps.index.symbolsInFile(at.repo, at.path) ?? [];
  return new Set(
    symbols.filter((symbol) => symbol.name.toLowerCase() === wanted).map((symbol) => symbol.line),
  );
}

/** "Class.method" around a line, from the index only (no parsing on the search hot path). */
export function enclosingName(deps: Pick<EngineDeps, 'index'>, at: FileSpot, line: number): string {
  const symbol = enclosingSymbol(deps.index.symbolsInFile(at.repo, at.path) ?? [], line);
  if (!symbol) return '';
  return symbol.container ? `${symbol.container}.${symbol.name}` : symbol.name;
}

export interface SymbolSearch {
  readonly hits: readonly SymbolHit[];
  /** Repos whose index is not usable yet, so they were not searched. */
  readonly unindexed: readonly string[];
}

/** API contracts (.proto, .graphql, .thrift) define a name too, but the code that runs comes first. */
const CONTRACT = /\.(proto|graphqls?|thrift|avdl)$/;

/**
 * Exact first; when nothing matches, prefix, then substring, so a near miss still finds something.
 * Within a step: exact case before other case, code before contracts, shorter names, then by path.
 */
export function findSymbolsIn(
  deps: Pick<EngineDeps, 'index'>,
  repos: readonly Repo[],
  query: Omit<SymbolQuery, 'match'> & { match?: SymbolQuery['match'] },
): SymbolSearch {
  const unindexed = repos
    .filter(
      (repo) =>
        deps.index.status(repo).indexedAt === 0 && deps.index.status(repo).state !== 'ready',
    )
    .map((repo) => repo.slug);
  const searchable = repos.filter((repo) => !unindexed.includes(repo.slug));
  const order: SymbolQuery['match'][] = query.match
    ? [query.match]
    : ['exact', 'prefix', 'contains'];
  const rank = (hit: SymbolHit): number =>
    (hit.name === query.name ? 0 : hit.name.toLowerCase() === query.name.toLowerCase() ? 2 : 4) +
    (CONTRACT.test(hit.path) ? 1 : 0);
  for (const match of order) {
    const hits = searchable.flatMap((repo) => deps.index.findSymbols(repo, { ...query, match }));
    const sorted = hits.toSorted(
      (a, b) =>
        rank(a) - rank(b) ||
        a.name.length - b.name.length ||
        `${a.repo}/${a.path}`.localeCompare(`${b.repo}/${b.path}`),
    );
    if (sorted.length > 0) return { hits: sorted.slice(0, query.limit), unindexed };
  }
  return { hits: [], unindexed };
}
