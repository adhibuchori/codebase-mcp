/**
 * Text for search_code: a header with the counts, then one block per file (path once, then its
 * hits as "line: code · in Symbol"), then what to do next. Four levels of detail keep any result
 * set inside the budget: full, lines only, one line per file, counts per repo.
 */
import { pickLevel } from '../../core/output/budget.ts';
import { plural, trimLine } from '../../core/output/trim.ts';
import { flagLabels } from '../../core/rank/classify.ts';
import type { FileGroup } from '../../core/rank/group.ts';
import type { RankedSearch } from './search.service.ts';
import { hitKey } from './search.service.ts';

export interface SearchView {
  readonly query: string;
  readonly offset: number;
  readonly limit: number;
  readonly perFile: number;
  readonly next: string;
  readonly budget: number;
}

function header(search: RankedSearch, view: SearchView): string {
  const { outcome } = search;
  const matches = search.groups.reduce((sum, group) => sum + group.shown.length + group.hidden, 0);
  const repos = new Set(search.groups.map((group) => group.repo)).size;
  const paged = view.offset > 0 || search.groups.length > view.limit;
  const shown = paged
    ? ` · files ${view.offset + 1}–${Math.min(view.offset + view.limit, search.groups.length)}`
    : '';
  return `"${view.query}": ${plural(matches, 'match')} in ${plural(search.groups.length, 'file')} across ${plural(repos, 'repo')} (searched ${plural(search.repoCount, 'repo')}, ${outcome.viaIndex} through the index)${shown}`;
}

function fileBlock(group: FileGroup, search: RankedSearch, perFile: number): string {
  const labels = flagLabels(group.flags);
  const tag = labels.length > 0 ? `  [${labels.join(', ')}]` : '';
  const hidden = group.hidden + Math.max(0, group.shown.length - perFile);
  const lines = group.shown.slice(0, perFile).map(({ match }) => {
    const symbol = search.symbols.get(hitKey(match));
    return `  ${match.line}: ${trimLine(match.text, match.column)}${symbol ? `  · in ${symbol}` : ''}`;
  });
  return [
    `${group.repo}/${group.path}${tag}`,
    ...lines,
    ...(hidden > 0 ? [`  … ${hidden} more in this file`] : []),
  ].join('\n');
}

function perRepo(groups: readonly FileGroup[]): string {
  const counts = new Map<string, number>();
  for (const group of groups) counts.set(group.repo, (counts.get(group.repo) ?? 0) + 1);
  return [...counts].map(([repo, files]) => `- ${repo}: ${plural(files, 'file')}`).join('\n');
}

function footer(search: RankedSearch, view: SearchView): string {
  const notes: string[] = [];
  if (view.next)
    notes.push(
      `More files: call search_code again with the same arguments and cursor="${view.next}".`,
    );
  if (search.outcome.truncated)
    notes.push(
      'The search stopped at its match limit: add repos, a path glob or a longer query to narrow it.',
    );
  if (search.outcome.timedOut)
    notes.push(
      'The search hit its time limit, so some repos may be missing: narrow with repos or path.',
    );
  if (search.groups.length === 0)
    notes.push(
      'No matches. Try mode "word" or "regex", drop case_sensitive, or check the spelling with find_symbol.',
    );
  return notes.join('\n');
}

export function renderSearch(search: RankedSearch, view: SearchView): string {
  const page = search.groups.slice(view.offset, view.offset + view.limit);
  const top = header(search, view);
  const bottom = footer(search, view);
  const build = (blocks: string) => () => [top, blocks, bottom].filter(Boolean).join('\n');
  return pickLevel(
    [
      build(page.map((group) => fileBlock(group, search, view.perFile)).join('\n')),
      build(page.map((group) => fileBlock(group, search, 1)).join('\n')),
      build(
        page
          .map((group) => `${group.repo}/${group.path} (${group.shown.length + group.hidden})`)
          .join('\n'),
      ),
      build(perRepo(search.groups)),
    ],
    view.budget,
  );
}
