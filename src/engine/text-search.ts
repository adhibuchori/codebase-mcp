/**
 * The query planner. For a broad search (many repos) the trigram index narrows each repo to the
 * files that can match, and only those are read; a focused search (a few repos) runs ripgrep
 * directly, which is just as fast there and always sees unsaved-to-index edits. Repos without a
 * usable index, or patterns with no literal of three characters, are scanned directly.
 */
import type {
  MatchMode,
  Repo,
  SearchEngineName,
  SearchResult,
  TextMatch,
} from '../core/model/domain.types.ts';
import { requiredLiterals, trigramMatch } from '../core/query/trigrams.ts';
import { globToRegex } from '../core/text/glob.ts';
import type { TextQuery, TextSearcher } from '../ports/search.ts';
import type { EngineDeps } from './engine-deps.types.ts';

export interface SearchInput {
  readonly pattern: string;
  readonly mode: MatchMode;
  readonly caseSensitive: boolean;
  readonly repos: readonly Repo[];
  readonly pathGlob: string;
  readonly maxMatches: number;
  readonly maxPerFile: number;
}

export interface SearchOutcome extends SearchResult {
  readonly reposSearched: number;
  /** Repos answered through the index (the rest were scanned). */
  readonly viaIndex: number;
}

const FOCUSED = 3;
const MAX_CANDIDATES = 5000;

interface Plan {
  readonly candidates: Map<Repo, readonly string[]>;
  readonly direct: Repo[];
  /** Why the index was or was not used, for the debug log. */
  readonly route: string;
  /** Repos the index ruled out entirely: no file can match. */
  readonly ruledOut: number;
}

function literalsOf(input: SearchInput): string[] {
  return input.mode === 'regex' ? requiredLiterals(input.pattern) : [input.pattern];
}

function routeOf(deps: EngineDeps, input: SearchInput, match: string): string {
  if (match === '') return 'scan: no literal of 3+ characters';
  if (deps.rg === null) return 'index: ripgrep unavailable';
  if (input.repos.length > FOCUSED) return `index: more than ${FOCUSED} repos`;
  return `scan: ${FOCUSED} repos or fewer`;
}

function plan(deps: EngineDeps, input: SearchInput): Plan {
  const match = trigramMatch(literalsOf(input));
  const route = routeOf(deps, input, match);
  const useIndex = route.startsWith('index');
  const candidates = new Map<Repo, readonly string[]>();
  const direct: Repo[] = [];
  const glob = input.pathGlob ? globToRegex(input.pathGlob) : null;
  for (const repo of input.repos) {
    const found = useIndex ? deps.index.candidates(repo, match, MAX_CANDIDATES + 1) : null;
    if (found === null || found.length > MAX_CANDIDATES) direct.push(repo);
    else if (found.length > 0)
      candidates.set(repo, glob ? found.filter((path) => glob.test(path)) : found);
  }
  const ruledOut = input.repos.length - direct.length - candidates.size;
  return { candidates, direct, route, ruledOut };
}

/** One debug line per search: how it was planned, how much was read, and where the time went. */
function logPlan(deps: EngineDeps, input: SearchInput, report: PlanReport): void {
  const { planned, result } = report;
  const files = [...planned.candidates.values()].reduce((sum, paths) => sum + paths.length, 0);
  deps.logger.debug('search plan', {
    pattern: input.pattern.slice(0, 80),
    mode: input.mode,
    route: planned.route,
    repos: input.repos.length,
    indexRepos: planned.candidates.size,
    candidateFiles: files,
    ruledOut: planned.ruledOut,
    scannedRepos: planned.direct.length,
    engines: result.engines.join(',') || 'none',
    filesSearched: result.filesSearched,
    matches: result.matches.length,
    timedOut: result.timedOut,
    planMs: report.planMs,
    ms: report.ms,
  });
}

interface PlanReport {
  readonly planned: Plan;
  readonly result: SearchResult;
  readonly planMs: number;
  readonly ms: number;
}

function merge(results: readonly SearchResult[], limit: number): SearchResult {
  const matches: TextMatch[] = results.flatMap((result) => result.matches).slice(0, limit);
  const engines = [...new Set(results.flatMap((result) => result.engines))];
  return {
    matches,
    filesSearched: results.reduce((sum, result) => sum + result.filesSearched, 0),
    truncated: results.some((result) => result.truncated),
    timedOut: results.some((result) => result.timedOut),
    engines,
  };
}

const EMPTY: SearchResult = {
  matches: [],
  filesSearched: 0,
  truncated: false,
  timedOut: false,
  engines: [],
};

export async function searchText(deps: EngineDeps, input: SearchInput): Promise<SearchOutcome> {
  const query: TextQuery = {
    pattern: input.pattern,
    mode: input.mode,
    caseSensitive: input.caseSensitive,
    pathGlob: input.pathGlob,
    maxMatches: input.maxMatches,
    maxPerFile: input.maxPerFile,
    deadline: deps.clock.now() + deps.limits.searchTimeoutMs,
  };
  const started = deps.clock.now();
  const planned = plan(deps, input);
  const planMs = deps.clock.now() - started;
  const { candidates, direct } = planned;
  const scanner: TextSearcher = deps.rg ?? deps.js;
  const verifier: TextSearcher = input.mode === 'regex' && deps.rg ? deps.rg : deps.js;
  const [verified, scanned] = await Promise.all([
    candidates.size > 0 ? verifier.verify(candidates, query) : EMPTY,
    direct.length > 0 ? scanner.scan(direct, query) : EMPTY,
  ]);
  const engines: SearchEngineName[] = candidates.size > 0 ? ['index'] : [];
  const merged = merge([verified, scanned], input.maxMatches);
  const result = { ...merged, engines: [...engines, ...merged.engines] };
  logPlan(deps, input, { planned, result, planMs, ms: deps.clock.now() - started });
  return {
    ...result,
    reposSearched: input.repos.length,
    viaIndex: input.repos.length - direct.length,
  };
}
