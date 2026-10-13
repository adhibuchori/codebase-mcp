/** list_repos: the orientation map — one fact-only line per service, grouped, filtered and paged. */
import { z } from 'zod';
import { pickLevel } from '../../core/output/budget.ts';
import { decodeCursor, encodeCursor, requestKey } from '../../core/output/cursor.ts';
import { plural } from '../../core/output/trim.ts';
import { defineTool } from '../registry/define-tool.ts';
import { cursorField, groupField } from '../registry/shared-input.ts';
import { groupedLines } from './repos.format.ts';
import { filteredCards, type RepoList } from './repos.service.ts';

const PAGE = 60;

function render(
  list: RepoList,
  page: { offset: number; key: string; budget: number; ripgrep: boolean },
): string {
  const shown = list.cards.slice(page.offset, page.offset + PAGE);
  const scope = list.cards.length < list.total ? ` (of ${list.total})` : '';
  const engine = page.ripgrep ? 'ripgrep + index' : 'index + JavaScript scan';
  const header = `${plural(list.cards.length, 'repo')}${scope} · index ready for ${list.ready} · search engine: ${engine}`;
  const more =
    page.offset + PAGE < list.cards.length
      ? `\nMore repos: call list_repos again with cursor="${encodeCursor(page.offset + PAGE, page.key)}".`
      : '';
  const empty =
    list.cards.length === 0 ? '\nNo repo matches. Drop the filters to see every repo.' : '';
  const level = (detail: 0 | 1 | 2) => () =>
    [header, ...groupedLines(shown, detail)].join('\n') + empty + more;
  return pickLevel([level(2), level(1), level(0)], page.budget);
}

export const listReposTool = defineTool({
  name: 'list_repos',
  title: 'List repos',
  description:
    'Lists the repositories (services) this server can read, one line each: main languages, frameworks, file count, HTTP endpoints, message topics, last commit and index state, grouped by folder. Start here to find which service owns a feature. Filter by part of the name, by group or by language. Example: {"query": "order"} or {"language": "go"}.',
  input: {
    query: z.string().optional().describe('Part of a repo name to filter by, e.g. "order".'),
    group: groupField,
    language: z
      .string()
      .optional()
      .describe('Only repos that mainly use this language id, e.g. "java", "go", "typescript".'),
    cursor: cursorField,
  },
  run: async (args, context) => {
    const key = requestKey(['list_repos', args.query, args.group, args.language]);
    const offset = decodeCursor(args.cursor, key);
    const list = await filteredCards(args, context);
    return render(list, { offset, key, budget: context.budget, ripgrep: context.deps.rg !== null });
  },
});
