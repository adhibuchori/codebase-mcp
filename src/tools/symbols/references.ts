/** find_symbol in references mode: whole-word uses of a name, minus the lines that define it. */
import { takeBlocks } from '../../core/output/budget.ts';
import { plural, trimLine } from '../../core/output/trim.ts';
import type { Repo, TextMatch } from '../../core/model/domain.types.ts';
import { classifyPath, FLAG_TEST } from '../../core/rank/classify.ts';
import { resolveRepos } from '../../engine/repo-scope.ts';
import { definitionLines } from '../../engine/symbols.ts';
import { searchText } from '../../engine/text-search.ts';
import type { ToolContext } from '../registry/define-tool.ts';

interface ReferenceArgs {
  readonly name: string;
  readonly repos?: string[] | undefined;
  readonly group?: string | undefined;
  readonly limit: number;
}

const isTest = (file: string): number => classifyPath(file) & FLAG_TEST;

/** Uses grouped by "repo/path", leaving out the lines that define the name. */
function usesByFile(
  context: ToolContext,
  matches: readonly TextMatch[],
  found: { repos: readonly Repo[]; name: string },
): Map<string, TextMatch[]> {
  const bySlug = new Map(found.repos.map((repo) => [repo.slug, repo]));
  const byFile = new Map<string, TextMatch[]>();
  for (const match of matches) {
    const repo = bySlug.get(match.repo);
    if (
      repo &&
      definitionLines(context.deps, { repo, path: match.path }, found.name).has(match.line)
    )
      continue;
    const key = `${match.repo}/${match.path}`;
    const list = byFile.get(key);
    if (list) list.push(match);
    else byFile.set(key, [match]);
  }
  return byFile;
}

function fileBlock([file, matches]: [string, TextMatch[]]): string {
  const shown = matches.slice(0, 3).map((m) => `  ${m.line}: ${trimLine(m.text, m.column)}`);
  return [file, ...shown, ...(matches.length > 3 ? [`  … ${matches.length - 3} more`] : [])].join(
    '\n',
  );
}

export async function findReferences(args: ReferenceArgs, context: ToolContext): Promise<string> {
  const repos = resolveRepos(context.deps.repos, args.repos, args.group);
  const query = {
    pattern: args.name,
    mode: 'word' as const,
    caseSensitive: true,
    repos,
    pathGlob: '',
  };
  const outcome = await searchText(context.deps, { ...query, maxMatches: 1000, maxPerFile: 20 });
  const byFile = usesByFile(context, outcome.matches, { repos, name: args.name });
  /* Source before tests, the busiest file first, then by path, so the order never depends on timing. */
  const files = [...byFile]
    .toSorted(([a, x], [b, y]) => isTest(a) - isTest(b) || y.length - x.length || (a < b ? -1 : 1))
    .slice(0, args.limit);
  const total = [...byFile.values()].reduce((sum, list) => sum + list.length, 0);
  const showing = byFile.size > files.length ? ` · showing ${files.length}` : '';
  const header = `References to "${args.name}": ${plural(total, 'use')} in ${plural(byFile.size, 'file')}${showing}`;
  const tail = outcome.truncated ? ['The search stopped at its limit; narrow with repos.'] : [];
  return takeBlocks([header, ...files.map(fileBlock), ...tail], context.budget).text;
}
