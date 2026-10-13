/** repo_overview: a one-screen map of one repo — facts, key files, endpoints, topics, folders. */
import { z } from 'zod';
import { defineTool } from '../registry/define-tool.ts';
import { renderOverview } from './overview.format.ts';
import { overviewOf } from './repos.service.ts';

export const repoOverviewTool = defineTool({
  name: 'repo_overview',
  title: 'Repo overview',
  description:
    'A one-screen map of one repo: languages, frameworks, last commit, build files and entrypoints, the HTTP endpoints and message topics it declares, and its folders with file counts (wide folders collapsed). Much cheaper than listing every file. Zoom into a folder with path. Example: {"repo": "orders", "path": "src/main/java", "depth": 3}.',
  input: {
    repo: z.string().describe('Repo name from list_repos.'),
    path: z
      .string()
      .optional()
      .describe('A folder inside the repo to zoom into, e.g. "src/main/java".'),
    depth: z.number().int().min(1).max(4).default(2).describe('Folder levels to show (default 2).'),
  },
  run: async (args, context) =>
    renderOverview(await overviewOf(args, context), args.depth, context.budget),
});
