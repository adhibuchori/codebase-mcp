/**
 * The only way the tools touch a file: the path is normalised, may not leave the repo (symlinks are
 * resolved and checked again), may not touch .git or a sensitive name, and must be a text file.
 */
import { ToolError } from '../core/errors/tool-error.ts';
import type { Repo } from '../core/model/domain.types.ts';
import { blockedReason, normalizeRelative } from '../core/security/path-rules.ts';
import { looksBinary, splitLines } from '../core/text/lines.ts';
import type { EngineDeps } from './engine-deps.types.ts';

export interface SafeFile {
  readonly repo: Repo;
  /** Repo-relative path with forward slashes. */
  readonly path: string;
  readonly absolute: string;
}

type AccessDeps = Pick<EngineDeps, 'fs' | 'blocked'>;

function insideRoot(root: string, real: string): string | null {
  const normalisedRoot = root.replaceAll('\\', '/').replace(/\/+$/, '');
  const normalisedReal = real.replaceAll('\\', '/');
  if (normalisedReal === normalisedRoot) return '';
  return normalisedReal.startsWith(`${normalisedRoot}/`)
    ? normalisedReal.slice(normalisedRoot.length + 1)
    : null;
}

export async function resolveFile(deps: AccessDeps, repo: Repo, input: string): Promise<SafeFile> {
  const path = normalizeRelative(input);
  const reason = blockedReason(path, deps.blocked);
  if (reason) throw new ToolError(reason);
  const real = await deps.fs.realpath(path ? `${repo.root}/${path}` : repo.root);
  if (!real)
    throw new ToolError(`Not found: ${repo.slug}/${path}`, 'Use find_files to look the path up.');
  const relative = insideRoot(repo.root, real);
  if (relative === null) throw new ToolError('Access denied: the path leaves the repo.');
  const realReason = blockedReason(relative, deps.blocked);
  if (realReason) throw new ToolError(realReason);
  return { repo, path, absolute: real };
}

/** The lines of a text file; refuses binaries and files beyond the size limit. */
export async function readTextFile(
  deps: AccessDeps & { readonly maxFileBytes: number },
  file: SafeFile,
): Promise<string[]> {
  const stat = await deps.fs.stat(file.absolute);
  if (!stat?.isFile)
    throw new ToolError(
      `${file.repo.slug}/${file.path} is not a file.`,
      'Use repo_overview to browse folders.',
    );
  if (stat.size > deps.maxFileBytes) {
    throw new ToolError(
      `${file.repo.slug}/${file.path} is larger than the ${Math.round(deps.maxFileBytes / 1024)} KB read limit.`,
      'Search inside it with search_code and a path filter instead.',
    );
  }
  if (looksBinary(await deps.fs.readHead(file.absolute, 8000)))
    throw new ToolError(`${file.repo.slug}/${file.path} is a binary file.`);
  return splitLines(await deps.fs.readText(file.absolute));
}
