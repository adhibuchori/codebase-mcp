/** search_code's work: plan and run the search, score every hit, group by file, label enclosing symbols. */
import type { MatchMode, Repo, TextMatch } from '../../core/model/domain.types.ts';
import { classifyPath, FLAG_TEST } from '../../core/rank/classify.ts';
import { groupByFile, type FileGroup } from '../../core/rank/group.ts';
import { scoreMatch } from '../../core/rank/score.ts';
import { definitionLines, enclosingName } from '../../engine/symbols.ts';
import { resolveRepos } from '../../engine/repo-scope.ts';
import { searchText, type SearchOutcome } from '../../engine/text-search.ts';
import type { ToolContext } from '../registry/define-tool.ts';

export interface SearchArgs {
  readonly query: string;
  readonly mode: MatchMode;
  readonly case_sensitive?: boolean | undefined;
  readonly repos?: readonly string[] | undefined;
  readonly group?: string | undefined;
  readonly path?: string | undefined;
  readonly include_tests: boolean;
}

export interface RankedSearch {
  readonly groups: readonly FileGroup[];
  readonly outcome: SearchOutcome;
  readonly repoCount: number;
  /** "Class.method" around a hit, keyed by "repo\0path\0line". */
  readonly symbols: ReadonlyMap<string, string>;
}

export const hitKey = (match: Pick<TextMatch, 'repo' | 'path' | 'line'>): string =>
  `${match.repo}\u0000${match.path}\u0000${match.line}`;

function scoreAll(
  context: ToolContext,
  args: SearchArgs,
  found: { matches: readonly TextMatch[]; bySlug: ReadonlyMap<string, Repo> },
) {
  const { matches, bySlug } = found;
  const needle = args.mode === 'regex' ? '' : args.query.toLowerCase();
  const definitions = new Map<string, Set<number>>();
  return matches.map((match) => {
    const fileKey = `${match.repo}\u0000${match.path}`;
    const repo = bySlug.get(match.repo);
    const lines =
      definitions.get(fileKey) ??
      (repo
        ? definitionLines(context.deps, { repo, path: match.path }, args.query)
        : new Set<number>());
    definitions.set(fileKey, lines);
    return {
      match,
      score: scoreMatch(match, { needle, definitionLines: lines, flags: classifyPath(match.path) }),
    };
  });
}

export async function runSearch(
  args: SearchArgs,
  context: ToolContext,
  maxPerFile: number,
): Promise<RankedSearch> {
  const repos = resolveRepos(context.deps.repos, args.repos, args.group);
  const caseSensitive = args.case_sensitive ?? /[A-Z]/.test(args.query);
  const outcome = await searchText(context.deps, {
    pattern: args.query,
    mode: args.mode,
    caseSensitive,
    repos,
    pathGlob: args.path ?? '',
    maxMatches: 800,
    maxPerFile: 50,
  });
  const bySlug = new Map(repos.map((repo) => [repo.slug, repo]));
  const grouped = groupByFile(
    scoreAll(context, args, { matches: outcome.matches, bySlug }),
    (_repo, path) => classifyPath(path),
    maxPerFile,
  );
  const groups = args.include_tests
    ? grouped
    : grouped.filter((group) => (group.flags & FLAG_TEST) === 0);
  const symbols = new Map<string, string>();
  for (const group of groups.slice(0, 60)) {
    const repo = bySlug.get(group.repo);
    for (const { match } of group.shown)
      if (repo)
        symbols.set(
          hitKey(match),
          enclosingName(context.deps, { repo, path: match.path }, match.line),
        );
  }
  return { groups, outcome, repoCount: repos.length, symbols };
}
