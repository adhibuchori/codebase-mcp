/**
 * A cheap fingerprint of a repo's git state: HEAD, the current branch ref, packed refs and the git
 * index. Commits, checkouts, pulls and staging all change it, at the cost of a few stat calls, so
 * hundreds of repos can be checked every 30 seconds. Unstaged edits are caught by the periodic rescan.
 */
import type { FileSystem } from '../ports/file-system.ts';

/** The git directory of a work tree: `.git` itself, or the path a `.git` file points to. */
export async function gitDirOf(fs: FileSystem, root: string): Promise<string | null> {
  const dotGit = `${root}/.git`;
  const stat = await fs.stat(dotGit);
  if (!stat) return null;
  if (stat.isDirectory) return dotGit;
  const pointer = /^gitdir:\s*(.+)$/m.exec(await fs.readText(dotGit).catch(() => ''));
  if (!pointer?.[1]) return null;
  const target = pointer[1].trim();
  return /^([a-zA-Z]:)?[\\/]/.test(target) ? target : `${root}/${target}`;
}

export async function gitStateFingerprint(fs: FileSystem, root: string): Promise<string> {
  const gitDir = await gitDirOf(fs, root);
  if (!gitDir) return '';
  const head = (await fs.readText(`${gitDir}/HEAD`).catch(() => '')).trim();
  const ref = head.startsWith('ref: ') ? head.slice(5).trim() : '';
  const files = [
    `${gitDir}/HEAD`,
    `${gitDir}/index`,
    `${gitDir}/packed-refs`,
    ...(ref ? [`${gitDir}/${ref}`] : []),
  ];
  const stats = await Promise.all(files.map((path) => fs.stat(path)));
  return [
    head,
    ...stats.map((stat) => (stat ? `${stat.size}:${Math.trunc(stat.mtimeMs)}` : '-')),
  ].join('|');
}
