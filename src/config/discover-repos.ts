/**
 * Finds every git repository below a root folder, level by level, so hundreds of microservice
 * repos need no manual list. A folder that holds `.git` (a folder, or a file for worktrees and
 * submodules) is a repo and is not searched further; dependency and build folders are skipped.
 */
import { BUILD_DIRS, IGNORED_DIRS } from '../core/security/sensitive-name.ts';
import { mapLimit } from '../core/async/map-limit.ts';
import type { DirEntry, FileSystem } from '../ports/file-system.ts';

export interface DiscoverOptions {
  readonly root: string;
  readonly maxDepth: number;
  /** Matched against the folder path relative to the root, with forward slashes. */
  readonly exclude: readonly RegExp[];
}

interface Level {
  readonly repos: string[];
  readonly next: string[];
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') || dir.endsWith('\\') ? `${dir}${name}` : `${dir}/${name}`;
}

function relativeTo(root: string, path: string): string {
  return path.slice(root.length).replaceAll('\\', '/').replace(/^\/+/, '');
}

function isCandidate(entry: DirEntry): boolean {
  if (!entry.isDirectory || entry.isSymlink) return false;
  return (
    !IGNORED_DIRS.has(entry.name) && !BUILD_DIRS.has(entry.name) && !entry.name.startsWith('.')
  );
}

async function visit(fs: FileSystem, dir: string, options: DiscoverOptions): Promise<Level> {
  const entries = await fs.readDir(dir).catch((): readonly DirEntry[] => []);
  if (entries.some((entry) => entry.name === '.git')) return { repos: [dir], next: [] };
  const next = entries
    .filter(isCandidate)
    .map((entry) => joinPath(dir, entry.name))
    .filter((path) => !options.exclude.some((re) => re.test(relativeTo(options.root, path))));
  return { repos: [], next };
}

interface WalkState {
  readonly frontier: readonly string[];
  readonly depth: number;
  readonly repos: string[];
}

/** One level at a time: every folder of a level is read concurrently, then the next level. */
async function walk(fs: FileSystem, state: WalkState, options: DiscoverOptions): Promise<void> {
  if (state.depth > options.maxDepth || state.frontier.length === 0) return;
  const levels = await mapLimit(state.frontier, 32, (dir) => visit(fs, dir, options));
  state.repos.push(...levels.flatMap((level) => level.repos));
  const frontier = levels.flatMap((level) => level.next);
  await walk(fs, { frontier, depth: state.depth + 1, repos: state.repos }, options);
}

/** Absolute paths of the repos below the root (the root itself when it is a repo), sorted. */
export async function discoverRepos(fs: FileSystem, options: DiscoverOptions): Promise<string[]> {
  const repos: string[] = [];
  await walk(fs, { frontier: [options.root], depth: 0, repos }, options);
  return repos.toSorted();
}
