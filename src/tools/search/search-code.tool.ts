/** search_code: ranked text search across every repo at once. */
import { z } from 'zod';
import { decodeCursor, encodeCursor, requestKey } from '../../core/output/cursor.ts';
import { defineTool } from '../registry/define-tool.ts';
import { cursorField, groupField, reposField } from '../registry/shared-input.ts';
import { renderSearch } from './search.format.ts';
import { runSearch } from './search.service.ts';

const PER_FILE = { brief: 1, normal: 3, full: 8 } as const;

export const searchCodeTool = defineTool({
  name: 'search_code',
  title: 'Search code',
  description:
    'Searches the text of every repo at once and returns the best files first (definitions and whole-word hits rank higher; tests, generated and vendored files lower), grouped by file with line numbers and the enclosing function. Literal by default; use mode "word" for identifiers or "regex" for patterns. Narrow with repos, group or a path glob. Example: {"query": "Order already cancelled"} or {"query": "cancelOrder", "mode": "word", "path": "src/**/*.java"}.',
  input: {
    query: z
      .string()
      .min(1)
      .max(500)
      .describe('Text to find. Case-insensitive unless it contains a capital letter.'),
    mode: z
      .enum(['literal', 'word', 'regex'])
      .default('literal')
      .describe('literal (default), word (whole identifier) or regex.'),
    case_sensitive: z.boolean().optional().describe('Force case sensitivity on or off.'),
    repos: reposField,
    group: groupField,
    path: z.string().optional().describe('Glob over file paths, e.g. "src/**/*.ts" or "*.go".'),
    include_tests: z
      .boolean()
      .default(true)
      .describe('Include test files (they rank lower). Default true.'),
    detail: z
      .enum(['brief', 'normal', 'full'])
      .default('normal')
      .describe('Hits per file: brief 1, normal 3, full 8.'),
    limit: z.number().int().min(1).max(50).default(15).describe('Files per page (default 15).'),
    cursor: cursorField,
  },
  run: async (args, context) => {
    const key = requestKey([
      'search_code',
      args.query,
      args.mode,
      args.case_sensitive,
      args.repos,
      args.group,
      args.path,
      args.include_tests,
    ]);
    const offset = decodeCursor(args.cursor, key);
    const search = await runSearch(args, context, PER_FILE[args.detail]);
    const next =
      offset + args.limit < search.groups.length ? encodeCursor(offset + args.limit, key) : '';
    return renderSearch(search, {
      query: args.query,
      offset,
      limit: args.limit,
      perFile: PER_FILE[args.detail],
      next,
      budget: context.budget,
    });
  },
});
