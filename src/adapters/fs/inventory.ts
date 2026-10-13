/**
 * Inventory port: the readable files of a repo. A git repo lists tracked plus untracked-but-not-
 * ignored files (so .gitignore is respected); any other folder is walked, skipping dependency and
 * build folders. Sensitive names and excluded globs never appear, and every entry carries its size
 * and mtime, which the indexer uses as a cheap change fingerprint.
 */
import { mapLimit } from '../../core/async/map-limit.ts';
import type { Repo } from '../../core/model/domain.types.ts';
import { isHiddenPath } from '../../core/security/path-rules.ts';
import { BUILD_DIRS, IGNORED_DIRS } from '../../core/security/sensitive-name.ts';
import { matchesAnyGlob } from '../../core/text/glob.ts';
import type { FileSystem } from '../../ports/file-system.ts';
import type { Inventory, InventoryEntry } from '../../ports/search.ts';

export interface InventoryDeps {
  readonly fs: FileSystem;
  /** Lists git-visible files of a root, or null when it is not a git work tree. */
  readonly listGitFiles: (root: string) => Promise<string[] | null>;
  readonly blocked: readonly RegExp[];
  readonly exclude: readonly RegExp[];
}

const WALK_LIMIT = 200_000;

async function walk(fs: FileSystem, root: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (relative: string): Promise<void> => {
    if (files.length >= WALK_LIMIT) return;
    const entries = await fs.readDir(relative ? `${root}/${relative}` : root).catch(() => []);
    const dirs: string[] = [];
    for (const entry of entries) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymlink) continue;
      if (entry.isFile) files.push(path);
      else if (entry.isDirectory && !IGNORED_DIRS.has(entry.name) && !BUILD_DIRS.has(entry.name))
        dirs.push(path);
    }
    await mapLimit(dirs, 8, visit);
  };
  await visit('');
  return files;
}

export function createInventory(deps: InventoryDeps): Inventory {
  const keep = (path: string): boolean =>
    !isHiddenPath(path, deps.blocked) &&
    !(deps.exclude.length > 0 && matchesAnyGlob(path, deps.exclude));
  return {
    list: async (repo: Repo): Promise<readonly InventoryEntry[]> => {
      const listed = (await deps.listGitFiles(repo.root)) ?? (await walk(deps.fs, repo.root));
      const paths = listed.map((path) => path.replaceAll('\\', '/')).filter(keep);
      const stats = await mapLimit(paths, 64, async (path) => ({
        path,
        stat: await deps.fs.stat(`${repo.root}/${path}`),
      }));
      return stats.flatMap(({ path, stat }) =>
        stat?.isFile ? [{ path, size: stat.size, mtimeMs: Math.trunc(stat.mtimeMs) }] : [],
      );
    },
  };
}
