/**
 * GitReader port on the git command line. Every user value is validated in core/security/git-input.ts
 * before it gets here, and here it always follows --end-of-options, so it is never read as an option.
 */
import { ToolError } from '../../core/errors/tool-error.ts';
import type { Repo } from '../../core/model/domain.types.ts';
import type { CommitDetail, GitReader, LogOptions, PickaxeOptions } from '../../ports/git.ts';
import { gitError, runGit, type GitContext } from './git-command.ts';
import { LOG_FORMAT, parseBlame, parseCommitLine, parseLog, splitShow } from './git-parse.ts';

async function output(context: GitContext, repo: Repo, args: readonly string[]): Promise<string> {
  const result = await runGit(context, { cwd: repo.root, args });
  if (result.code !== 0 && !result.truncated) throw new ToolError(gitError(result));
  return result.stdout;
}

function logArgs(options: Pick<LogOptions, 'limit' | 'since'>): string[] {
  return [
    'log',
    `-n${options.limit}`,
    '--date=short',
    LOG_FORMAT,
    ...(options.since ? [`--since=${options.since}`] : []),
  ];
}

function pathArgs(path: string): string[] {
  return path ? ['--', path] : [];
}

async function resolveCommit(context: GitContext, repo: Repo, rev: string): Promise<string> {
  const result = await runGit(context, {
    cwd: repo.root,
    args: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${rev}^{commit}`],
  });
  const sha = result.stdout.trim();
  if (result.code !== 0 || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new ToolError(
      `Revision "${rev}" was not found in ${repo.slug}.`,
      'Use git_history action "log" to list commits.',
    );
  }
  return sha;
}

async function show(
  context: GitContext,
  repo: Repo,
  input: { rev: string; maxLines: number; extra: readonly RegExp[] },
): Promise<CommitDetail> {
  const sha = await resolveCommit(context, repo, input.rev);
  const args = [
    'show',
    '--date=short',
    LOG_FORMAT,
    '--stat=100',
    '--patch',
    '--unified=2',
    '--no-ext-diff',
    '--no-textconv',
    '--end-of-options',
    sha,
  ];
  const parts = splitShow(await output(context, repo, args), input.extra);
  const summary = parseCommitLine(parts.header) ?? {
    sha: sha.slice(0, 8),
    date: '',
    author: '',
    subject: '',
  };
  const patchCut = parts.patch.length > input.maxLines;
  return {
    summary,
    stat: parts.stat,
    patch: parts.patch.slice(0, input.maxLines).join('\n'),
    patchCut,
  };
}

export function createGitReader(context: GitContext, extraBlocked: readonly RegExp[]): GitReader {
  return {
    isRepo: async (repo) =>
      (
        await runGit(context, { cwd: repo.root, args: ['rev-parse', '--is-inside-work-tree'] })
      ).stdout.trim() === 'true',
    log: async (repo, options) => {
      const revision = options.rev ? [options.rev] : [];
      return parseLog(
        await output(context, repo, [
          ...logArgs(options),
          '--end-of-options',
          ...revision,
          ...pathArgs(options.path),
        ]),
      );
    },
    pickaxe: async (repo, options: PickaxeOptions) => {
      const flag = options.regex ? `-G${options.text}` : `-S${options.text}`;
      const args = [
        ...logArgs({ limit: options.limit, since: '' }),
        flag,
        '--end-of-options',
        ...pathArgs(options.path),
      ];
      return parseLog(await output(context, repo, args));
    },
    blame: async (repo, path, range) => {
      /* git blame reads every argument after --end-of-options as a revision, so it is not used here:
         the only revision is the fixed HEAD, and the user's path comes after "--". */
      const args = ['blame', '--porcelain', `-L${range.start},${range.end}`, 'HEAD', '--', path];
      return parseBlame(await output(context, repo, args));
    },
    show: (repo, rev, maxLines) => show(context, repo, { rev, maxLines, extra: extraBlocked }),
  };
}

/** Tracked and untracked-but-not-ignored files, or null when the folder is not a git work tree. */
export async function listGitFiles(context: GitContext, root: string): Promise<string[] | null> {
  const result = await runGit(context, {
    cwd: root,
    args: ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    maxBytes: 256 * 1024 * 1024,
  });
  if (result.code !== 0) return null;
  return [...new Set(result.stdout.split('\0').filter(Boolean))];
}
