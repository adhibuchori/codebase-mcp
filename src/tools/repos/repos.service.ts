/** Data for the repos tools: filtered, ordered repo cards and the facts of one repo. */
import { mapLimit } from '../../core/async/map-limit.ts';
import { ToolError } from '../../core/errors/tool-error.ts';
import type { Repo, RouteHit } from '../../core/model/domain.types.ts';
import { normalizeRelative } from '../../core/security/path-rules.ts';
import type { RepoCard } from '../../engine/catalog.ts';
import { buildTree, findFolder, type FolderNode } from '../../engine/repo-tree.ts';
import { requireRepo } from '../../engine/repo-scope.ts';
import type { ToolContext } from '../registry/define-tool.ts';

export interface RepoFilter {
  readonly query?: string | undefined;
  readonly group?: string | undefined;
  readonly language?: string | undefined;
}

export interface RepoList {
  readonly cards: readonly RepoCard[];
  readonly total: number;
  readonly ready: number;
}

function matchesName(repo: Repo, query: string): boolean {
  const wanted = query.toLowerCase();
  return repo.slug.includes(wanted) || repo.group.toLowerCase().includes(wanted);
}

export async function filteredCards(filter: RepoFilter, context: ToolContext): Promise<RepoList> {
  const all = context.deps.repos.list();
  const group = filter.group?.toLowerCase();
  const named = all.filter(
    (repo) =>
      (!filter.query || matchesName(repo, filter.query)) &&
      (!group || repo.group.toLowerCase() === group),
  );
  const cards = await mapLimit(named, 8, (repo) => context.catalog.card(repo));
  const language = filter.language?.toLowerCase();
  const filtered = language
    ? cards.filter((card) => card.languages.some((entry) => entry.id === language))
    : cards;
  return {
    cards: filtered.toSorted(
      (a, b) => a.repo.group.localeCompare(b.repo.group) || a.repo.slug.localeCompare(b.repo.slug),
    ),
    total: all.length,
    ready: cards.filter((card) => card.status.state === 'ready').length,
  };
}

export interface Overview {
  readonly card: RepoCard;
  readonly folder: string;
  readonly tree: FolderNode;
  readonly paths: readonly string[];
  readonly routes: readonly RouteHit[];
}

async function pathsOf(context: ToolContext, repo: Repo): Promise<string[]> {
  const indexed = context.deps.index.files(repo);
  if (indexed) return indexed.map((file) => file.path);
  return (await context.deps.inventory.list(repo)).map((entry) => entry.path);
}

export async function overviewOf(
  input: { repo: string; path?: string | undefined },
  context: ToolContext,
): Promise<Overview> {
  const repo = requireRepo(context.deps.repos, input.repo);
  const [card, paths] = await Promise.all([context.catalog.card(repo), pathsOf(context, repo)]);
  const folder = normalizeRelative(input.path ?? '');
  const tree = findFolder(buildTree(paths), folder);
  if (!tree)
    throw new ToolError(
      `No folder "${folder}" in ${repo.slug}.`,
      'Call repo_overview without a path to see the top folders.',
    );
  const scoped = folder ? paths.filter((path) => path.startsWith(`${folder}/`)) : paths;
  return {
    card,
    folder,
    tree,
    paths: scoped,
    routes: context.deps.index.routes(repo, ['http', 'topic']),
  };
}
