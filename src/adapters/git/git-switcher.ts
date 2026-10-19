/**
 * GitSwitcher port on the git command line: the server's only write, and it stays local. The switch
 * runs one fixed command on top of the hardening every git call gets (git-command.ts):
 * - `--no-guess`: a branch that exists only on a remote is refused, never created from it;
 * - `protocol.allow=never`: git may not reach any remote, not even for a partial clone's missing
 *   objects, so nothing is ever fetched;
 * - `core.hooksPath=/dev/null`: no repo hook (post-checkout, …) runs;
 * - no submodule recursion and no Git LFS download filter;
 * - no `--force`, `--discard-changes` or `--merge`, and the branch follows --end-of-options.
 */
import { ToolError } from '../../core/errors/tool-error.ts';
import type { Repo } from '../../core/model/domain.types.ts';
import type { BranchState, GitSwitcher } from '../../ports/git.ts';
import { gitError, runGit, type GitContext } from './git-command.ts';

/** Placed before the subcommand; a hooks path inside /dev/null can never hold a hook. */
const SWITCH_CONFIG = [
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'protocol.allow=never',
  '-c',
  'submodule.recurse=false',
  '-c',
  'filter.lfs.smudge=',
  '-c',
  'filter.lfs.process=',
  '-c',
  'filter.lfs.required=false',
];

function switchArgs(branch: string): string[] {
  return [
    ...SWITCH_CONFIG,
    'switch',
    '--no-guess',
    '--no-recurse-submodules',
    '--quiet',
    '--end-of-options',
    branch,
  ];
}

async function lines(context: GitContext, repo: Repo, args: readonly string[]): Promise<string[]> {
  const result = await runGit(context, { cwd: repo.root, args });
  return result.code === 0 ? result.stdout.split('\n').filter(Boolean) : [];
}

export function createGitSwitcher(context: GitContext): GitSwitcher {
  return {
    state: async (repo) => {
      const [current, branches, changed] = await Promise.all([
        lines(context, repo, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        lines(context, repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']),
        lines(context, repo, ['status', '--porcelain=v1', '--untracked-files=no']),
      ]);
      return {
        current: current[0] ?? '',
        branches: branches.toSorted(),
        changed: changed.length,
      } satisfies BranchState;
    },
    switchTo: async (repo, branch) => {
      const result = await runGit(context, { cwd: repo.root, args: switchArgs(branch) });
      if (result.code !== 0) throw new ToolError(gitError(result));
    },
  };
}
