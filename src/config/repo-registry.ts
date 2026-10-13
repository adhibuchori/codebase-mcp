/**
 * Builds the repo registry: explicit repos plus every repo discovered under the roots. Each repo gets
 * a unique slug (its folder name in lower case; on a clash the group becomes a prefix) and a group
 * (configured, or the first folder below its root, e.g. ~/work/payments/orders → "payments").
 */
import type { Repo } from '../core/model/domain.types.ts';
import { globToRegex } from '../core/text/glob.ts';
import type { FileSystem } from '../ports/file-system.ts';
import type { RepoRegistry } from '../ports/runtime.ts';
import type { AppConfig, RootConfig } from './config-schema.ts';
import { discoverRepos } from './discover-repos.ts';

export interface RegistryResult {
  readonly registry: RepoRegistry;
  readonly problems: readonly string[];
}

interface Candidate {
  readonly name: string;
  readonly path: string;
  readonly group: string;
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[-.]+|-+$/g, '') || 'repo'
  );
}

export function expandHome(path: string, home: string): string {
  if (path === '~') return home;
  return path.startsWith('~/') || path.startsWith('~\\') ? `${home}${path.slice(1)}` : path;
}

function baseOf(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/, '').split('/').at(-1) ?? path;
}

async function fromRoot(
  fs: FileSystem,
  root: RootConfig,
  home: string,
): Promise<Candidate[] | string> {
  const real = await fs.realpath(expandHome(root.path, home));
  if (!real) return `Root ${root.path} not found.`;
  const exclude = root.exclude.map(globToRegex);
  const found = await discoverRepos(fs, { root: real, maxDepth: root.maxDepth, exclude });
  return found.map((path) => {
    const relative = path.slice(real.length).replaceAll('\\', '/').replace(/^\/+/, '');
    const segments = relative.split('/').filter(Boolean);
    const group = root.group ?? (segments.length >= 2 ? (segments[0] ?? '') : '');
    return { name: baseOf(path), path, group };
  });
}

async function resolve(
  fs: FileSystem,
  candidate: Candidate,
): Promise<(Omit<Repo, 'slug'> & { name: string }) | string> {
  const real = await fs.realpath(candidate.path);
  if (!real) return `Skipping repo "${candidate.name}": ${candidate.path} not found.`;
  const stat = await fs.stat(real);
  if (!stat?.isDirectory)
    return `Skipping repo "${candidate.name}": ${candidate.path} is not a folder.`;
  return { name: candidate.name, root: real, group: candidate.group };
}

function assignSlugs(resolved: readonly (Omit<Repo, 'slug'> & { name: string })[]): Repo[] {
  const used = new Set<string>();
  const seenRoots = new Set<string>();
  const repos: Repo[] = [];
  for (const entry of resolved) {
    if (seenRoots.has(entry.root)) continue;
    seenRoots.add(entry.root);
    let slug = slugify(entry.name);
    if (used.has(slug) && entry.group) slug = slugify(`${entry.group}-${entry.name}`);
    for (let n = 2; used.has(slug); n++) slug = `${slugify(entry.name)}-${n}`;
    used.add(slug);
    repos.push({ slug, root: entry.root, group: entry.group });
  }
  return repos;
}

export function createRegistry(repos: readonly Repo[]): RepoRegistry {
  const bySlug = new Map(repos.map((repo) => [repo.slug, repo]));
  return { list: () => repos, get: (slug) => bySlug.get(slug.toLowerCase()) };
}

export async function buildRegistry(
  fs: FileSystem,
  config: AppConfig,
  home: string,
): Promise<RegistryResult> {
  const problems: string[] = [];
  const explicit: Candidate[] = config.repos.map((repo) => ({
    ...repo,
    path: expandHome(repo.path, home),
  }));
  const rooted = await Promise.all(config.roots.map((root) => fromRoot(fs, root, home)));
  const candidates = [...explicit];
  for (const result of rooted) {
    if (typeof result === 'string') problems.push(result);
    else candidates.push(...result);
  }
  const resolved = await Promise.all(candidates.map((candidate) => resolve(fs, candidate)));
  const valid = resolved.filter((entry): entry is Omit<Repo, 'slug'> & { name: string } => {
    if (typeof entry === 'string') problems.push(entry);
    return typeof entry !== 'string';
  });
  return { registry: createRegistry(assignSlugs(valid)), problems };
}
