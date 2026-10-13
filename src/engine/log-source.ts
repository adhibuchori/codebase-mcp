/**
 * Finds the statement that wrote a log line or raised an error. The constant fragments of the
 * message are searched literally across the repos; a line that holds several fragments, or sits in
 * a logger or throw call, ranks first. Wrapped Go errors are split so each layer is found.
 */
import { errorChain, literalFragments } from '../core/logs/fragments.ts';
import type { Repo, TextMatch } from '../core/model/domain.types.ts';
import { classifyPath, FLAG_DOCS, FLAG_TEST } from '../core/rank/classify.ts';
import type { EngineDeps } from './engine-deps.types.ts';
import { searchText } from './text-search.ts';

interface LogCandidate {
  readonly match: TextMatch;
  readonly fragments: readonly string[];
  readonly logCall: boolean;
  readonly score: number;
}

export interface LogSearch {
  readonly fragments: readonly string[];
  readonly candidates: readonly LogCandidate[];
}

/** The fragments to search: the message's own, plus the longest fragment of each wrapped layer. */
function searchFragments(message: string): string[] {
  const own = literalFragments(message);
  const layers = errorChain(message).flatMap((segment) => literalFragments(segment, 4, 1));
  return [...new Set([...own, ...layers])].slice(0, 5);
}

function isLogCall(deps: EngineDeps, match: TextMatch): boolean {
  const pack = deps.languages.forPath(match.path);
  return (
    Boolean(pack?.logCall?.test(match.text)) ||
    deps.loggerNames.some((name) => match.text.includes(name))
  );
}

function score(entry: { fragments: Set<string>; logCall: boolean; match: TextMatch }): number {
  const length = [...entry.fragments].reduce((sum, fragment) => sum + fragment.length, 0);
  const flags = classifyPath(entry.match.path);
  const penalty = flags & FLAG_TEST ? 0.3 : flags & FLAG_DOCS ? 0.2 : 1;
  return (length + entry.fragments.size * 20 + (entry.logCall ? 50 : 0)) * penalty;
}

type LineHit = { match: TextMatch; fragments: Set<string>; logCall: boolean };

/** One entry per matched line, with every fragment found on it. */
function byLine(
  deps: EngineDeps,
  fragments: readonly string[],
  results: readonly { matches: readonly TextMatch[] }[],
): Map<string, LineHit> {
  const lines = new Map<string, LineHit>();
  results.forEach((result, index) => {
    const fragment = fragments[index] ?? '';
    for (const match of result.matches) {
      const key = `${match.repo}\u0000${match.path}\u0000${match.line}`;
      const entry = lines.get(key) ?? {
        match,
        fragments: new Set<string>(),
        logCall: isLogCall(deps, match),
      };
      entry.fragments.add(fragment);
      lines.set(key, entry);
    }
  });
  return lines;
}

export async function findLogSources(
  deps: EngineDeps,
  message: string,
  repos: readonly Repo[],
): Promise<LogSearch> {
  const fragments = searchFragments(message);
  const literal = {
    mode: 'literal' as const,
    caseSensitive: false,
    repos,
    pathGlob: '',
    maxMatches: 200,
    maxPerFile: 20,
  };
  const searches = await Promise.all(
    fragments.map((pattern) => searchText(deps, { pattern, ...literal })),
  );
  const candidates = [...byLine(deps, fragments, searches).values()].map((entry) => ({
    match: entry.match,
    fragments: [...entry.fragments],
    logCall: entry.logCall,
    score: score(entry),
  }));
  return { fragments, candidates: candidates.toSorted((a, b) => b.score - a.score) };
}
