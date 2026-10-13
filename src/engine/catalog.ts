/**
 * One short, fact-only card per repo: languages, frameworks, size, endpoints, topics, last commit
 * and index state. The list of cards is the orientation map an agent reads first; cards are cached
 * until the repo's index changes.
 */
import { mapLimit } from '../core/async/map-limit.ts';
import type { Repo } from '../core/model/domain.types.ts';
import type { FrameworkRule } from '../core/model/language-pack.types.ts';
import type { CommitSummary } from '../ports/git.ts';
import type { IndexStatus } from '../ports/index-store.ts';
import type { EngineDeps } from './engine-deps.types.ts';

export interface RepoCard {
  readonly repo: Repo;
  readonly languages: readonly { readonly id: string; readonly files: number }[];
  readonly frameworks: readonly string[];
  readonly files: number;
  readonly endpoints: number;
  readonly topics: number;
  readonly grpc: number;
  readonly lastCommit: CommitSummary | null;
  readonly status: IndexStatus;
}

const NOT_CODE = new Set(['text', 'binary', 'config', 'generic']);

async function filePaths(deps: EngineDeps, repo: Repo): Promise<{ path: string; lang: string }[]> {
  const indexed = deps.index.files(repo);
  if (indexed) return indexed.map((file) => ({ path: file.path, lang: file.lang }));
  const listed = await deps.inventory.list(repo);
  return listed.map((entry) => ({
    path: entry.path,
    lang: deps.languages.forPath(entry.path)?.id ?? 'text',
  }));
}

function languageCounts(files: readonly { lang: string }[]): { id: string; files: number }[] {
  const counts = new Map<string, number>();
  for (const file of files)
    if (!NOT_CODE.has(file.lang)) counts.set(file.lang, (counts.get(file.lang) ?? 0) + 1);
  return [...counts]
    .map(([id, count]) => ({ id, files: count }))
    .toSorted((a, b) => b.files - a.files)
    .slice(0, 4);
}

async function detectFrameworks(
  deps: EngineDeps,
  repo: Repo,
  paths: readonly string[],
): Promise<string[]> {
  const rules: readonly FrameworkRule[] = deps.languages
    .all()
    .flatMap((pack) => pack.frameworks ?? []);
  const buildFiles = paths
    .filter((path) => path.split('/').length <= 3 && rules.some((rule) => rule.file.test(path)))
    .slice(0, 20);
  const found = await mapLimit(buildFiles, 8, async (path) => {
    const text = await deps.fs.readText(`${repo.root}/${path}`).catch(() => '');
    return rules
      .filter((rule) => rule.file.test(path) && rule.contains.test(text))
      .map((rule) => rule.name);
  });
  return [...new Set(found.flat())].toSorted();
}

async function lastCommit(deps: EngineDeps, repo: Repo): Promise<CommitSummary | null> {
  try {
    const [commit] = await deps.git.log(repo, { limit: 1, path: '', since: '', rev: '' });
    return commit ?? null;
  } catch {
    return null;
  }
}

async function buildCard(deps: EngineDeps, repo: Repo): Promise<RepoCard> {
  const files = await filePaths(deps, repo);
  const routes = deps.index.routes(repo, ['http', 'topic', 'grpc']);
  const count = (kind: string, role?: string): number =>
    routes.filter((r) => r.kind === kind && (!role || r.role === role)).length;
  return {
    repo,
    languages: languageCounts(files),
    frameworks: await detectFrameworks(
      deps,
      repo,
      files.map((file) => file.path),
    ),
    files: files.length,
    endpoints: count('http', 'handler'),
    topics: new Set(routes.filter((r) => r.kind === 'topic').map((r) => r.pattern)).size,
    grpc: count('grpc', 'handler'),
    lastCommit: await lastCommit(deps, repo),
    status: deps.index.status(repo),
  };
}

export interface Catalog {
  card(repo: Repo): Promise<RepoCard>;
}

export function createCatalog(deps: EngineDeps): Catalog {
  const cache = new Map<string, { key: string; card: Promise<RepoCard> }>();
  return {
    card: (repo) => {
      const status = deps.index.status(repo);
      const key = `${status.state}:${status.indexedAt}`;
      const cached = cache.get(repo.slug);
      if (cached?.key === key) return cached.card;
      const card = buildCard(deps, repo);
      cache.set(repo.slug, { key, card });
      return card;
    },
  };
}
