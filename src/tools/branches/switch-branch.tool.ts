/** switch_branch: list a repo's branches, or switch it to one. Registered only when allowed. */
import { z } from 'zod';
import { defineTool } from '../registry/define-tool.ts';
import { renderBranches } from './branches.format.ts';
import { switchBranch } from './branches.service.ts';

export const switchBranchTool = defineTool({
  name: 'switch_branch',
  title: 'Switch branch',
  description:
    'Lists the branches of one repo, or switches the repo to one so every other tool reads that branch. Without "branch" it shows the current branch, the local ones and the remote ones already fetched to this machine. A fetched remote branch (like origin/develop) gets its local branch created on the switch, with no network; nothing is ever downloaded, and a repo with uncommitted changes is refused. Example: {"repo": "orders", "branch": "release/2.3"}.',
  input: {
    repo: z.string().describe('Repo name from list_repos.'),
    branch: z
      .string()
      .optional()
      .describe('Branch to switch to (develop, or origin/develop); leave it out to list them.'),
  },
  annotations: { readOnlyHint: false },
  run: async (args, context) => renderBranches(await switchBranch(args, context)),
});
