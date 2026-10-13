/**
 * Pure path checks: a repo-relative path is normalised to forward slashes, must stay inside the
 * repo, and may not touch .git or a sensitive name. The symlink check needs the file system and
 * lives in engine/file-access.ts.
 */
import { ToolError } from '../errors/tool-error.ts';
import { IGNORED_DIRS, isSensitiveName } from './sensitive-name.ts';

/** Normalises user input to a clean repo-relative POSIX path ("" for the repo root). */
export function normalizeRelative(input: string): string {
  if (input.includes('\0')) throw new ToolError('Invalid path.', 'Paths cannot contain NUL bytes.');
  const slashed = input.replaceAll('\\', '/').trim();
  if (/^([a-zA-Z]:)?\//.test(slashed)) {
    throw new ToolError(
      `"${input}" is an absolute path.`,
      'Use a path relative to the repo root, e.g. src/main/App.java.',
    );
  }
  const parts: string[] = [];
  for (const segment of slashed.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) throw new ToolError('Access denied: the path leaves the repo.');
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join('/');
}

/** Why a repo-relative path must stay hidden, or "" when it may be read. */
export function blockedReason(relative: string, extra: readonly RegExp[]): string {
  const segments = relative.split('/').filter(Boolean);
  if (segments.includes('.git')) return 'Access denied: .git directory.';
  if (segments.some((segment) => isSensitiveName(segment, extra)))
    return 'Access denied: sensitive file.';
  return '';
}

/** True for a path the indexer and the walker skip: an ignored folder or a sensitive name. */
export function isHiddenPath(relative: string, extra: readonly RegExp[]): boolean {
  const segments = relative.split('/');
  return (
    segments.some((segment) => IGNORED_DIRS.has(segment)) || blockedReason(relative, extra) !== ''
  );
}
