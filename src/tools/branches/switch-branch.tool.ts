/** switch_branch: list a repo's local branches, or switch it to one. Registered only when allowed. */
import { z } from 'zod';
import { defineTool } from '../registry/define-tool.ts';
import { renderBranches } from './branches.format.ts';
import { switchBranch } from './branches.service.ts';

export const switchBranchTool = defineTool({
  name: 'switch_branch',
  title: 'Switch branch',
  description:
    'Lists the local branches of one repo, or switches the repo to one of them so every other tool reads that branch. Without "branch" it shows the current branch and the local ones. Only branches that already exist on this machine work: nothing is fetched or created, and a repo with uncommitted changes is refused. Example: {"repo": "orders", "branch": "develop"}.',
  input: {
    repo: z.string().describe('Repo name from list_repos.'),
    branch: z
      .string()
      .optional()
      .describe('Local branch to switch to; leave it out to list the branches.'),
  },
  annotations: { readOnlyHint: false },
  run: async (args, context) => renderBranches(await switchBranch(args, context)),
});
