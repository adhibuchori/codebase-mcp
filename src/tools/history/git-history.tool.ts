/** git_history: recent commits, when a string appeared (pickaxe), blame, and one commit's diff. */
import { z } from 'zod';
import { defineTool } from '../registry/define-tool.ts';
import { limitField } from '../registry/shared-input.ts';
import { renderHistory } from './history.format.ts';
import { history } from './history.service.ts';

export const gitHistoryTool = defineTool({
  name: 'git_history',
  title: 'Git history',
  description:
    'Read-only git history of one repo, for regressions. action "log": recent commits (optionally for a path, since a date or from a ref). "pickaxe": commits that added or removed a string (with regex: true, commits whose diff lines match). "blame": who last changed each line of a range. "show": one commit with its file stats and diff (sensitive files hidden). Example: {"repo": "orders", "action": "pickaxe", "query": "Order already cancelled"}.',
  input: {
    repo: z.string().describe('Repo name from list_repos.'),
    action: z.enum(['log', 'pickaxe', 'blame', 'show']).default('log'),
    path: z.string().optional().describe('File or folder inside the repo (log, pickaxe, blame).'),
    query: z
      .string()
      .optional()
      .describe('pickaxe: the text whose appearance or removal you want to find.'),
    regex: z
      .boolean()
      .default(false)
      .describe('pickaxe: match diff lines against query as a regex (git -G).'),
    rev: z.string().optional().describe('show: commit sha or ref. log: start from this ref.'),
    lines: z
      .string()
      .optional()
      .describe('blame: line range, e.g. "120-160" (default 1-80, at most 200 lines).'),
    since: z.string().optional().describe('log and pickaxe: "2026-09-01" or "14 days".'),
    limit: limitField(20, 100),
  },
  run: async (args, context) => renderHistory(await history(args, context), context.budget),
});
