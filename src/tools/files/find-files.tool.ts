/** find_files: fuzzy file-path search across repos. */
import { z } from 'zod';
import { mapLimit } from '../../core/async/map-limit.ts';
import { takeBlocks } from '../../core/output/budget.ts';
import { plural } from '../../core/output/trim.ts';
import { classifyPath, flagLabels } from '../../core/rank/classify.ts';
import { scorePath } from '../../core/text/path-score.ts';
import type { Repo } from '../../core/model/domain.types.ts';
import { resolveRepos } from '../../engine/repo-scope.ts';
import { defineTool, type ToolContext } from '../registry/define-tool.ts';
import { groupField, limitField, reposField } from '../registry/shared-input.ts';

async function pathsOf(context: ToolContext, repo: Repo): Promise<readonly string[]> {
  const indexed = context.deps.index.files(repo);
  if (indexed) return indexed.map((file) => file.path);
  return (await context.deps.inventory.list(repo)).map((entry) => entry.path);
}

async function findFiles(
  args: { query: string; repos?: string[] | undefined; group?: string | undefined; limit: number },
  context: ToolContext,
): Promise<string> {
  const repos = resolveRepos(context.deps.repos, args.repos, args.group);
  const lists = await mapLimit(repos, 8, async (repo) =>
    (await pathsOf(context, repo)).map((path) => ({
      repo,
      path,
      score: scorePath(path, args.query),
    })),
  );
  const hits = lists.flat().filter((hit) => hit.score > 0);
  const ranked = hits
    .toSorted((a, b) => b.score - a.score || a.path.length - b.path.length)
    .slice(0, args.limit);
  const lines = ranked.map((hit) => {
    const labels = flagLabels(classifyPath(hit.path));
    return `${hit.repo.slug}/${hit.path}${labels.length > 0 ? `  [${labels.join(', ')}]` : ''}`;
  });
  const header = `"${args.query}": ${plural(hits.length, 'file')} in ${plural(repos.length, 'repo')} searched${hits.length > ranked.length ? ` · showing the best ${ranked.length}` : ''}`;
  const hint =
    hits.length === 0
      ? 'No file path matches. Try fewer words, or search_code for text inside files.'
      : 'Next: read_code "<repo/path>" (or mode "outline").';
  return takeBlocks([header, ...lines, hint], context.budget).text;
}

export const findFilesTool = defineTool({
  name: 'find_files',
  title: 'Find files',
  description:
    'Finds files by name or path across repos with fuzzy matching: every word must appear in the path, file-name hits rank first, and a single word also matches abbreviations ("ordctl" finds OrderController.java). Example: {"query": "order controller"} or {"query": "docker-compose", "repos": ["payments"]}.',
  input: {
    query: z
      .string()
      .min(1)
      .max(200)
      .describe('Words or an abbreviation from the file name or path.'),
    repos: reposField,
    group: groupField,
    limit: limitField(20, 100),
  },
  run: findFiles,
});
