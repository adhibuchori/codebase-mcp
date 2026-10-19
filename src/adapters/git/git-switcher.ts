/**
 * GitSwitcher port on the git command line: the server's only write, and it stays local. The switch
 * runs one fixed command on top of the hardening every git call gets (git-command.ts):
 * - `--no-guess`: git never picks a remote branch on its own; a local branch is created only from
 *   the already fetched remote branch the caller names (`--create … --track`);
 * - `protocol.allow=never`: git may not reach any remote, not even for a partial clone's missing
 *   objects, so nothing is ever fetched;
 * - `core.hooksPath=/dev/null`: no repo hook (post-checkout, …) runs;
 * - no submodule recursion and no Git LFS download filter;
 * - no `--force`, `--discard-changes` or `--merge`, and the branch follows --end-of-options.
 */
import { ToolError } from '../../core/errors/tool-error.ts';
import type { Repo } from '../../core/model/domain.types.ts';
import type { BranchState, GitSwitcher, RemoteBranch } from '../../ports/git.ts';
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

/** A local branch, or a new one created from a fetched remote branch (`from`, e.g. origin/x). */
function switchArgs(branch: string, from: string): string[] {
  const target = from
    ? ['--track', `--create=${branch}`, '--end-of-options', from]
    : ['--end-of-options', branch];
  return [
    ...SWITCH_CONFIG,
    'switch',
    '--no-guess',
    '--no-recurse-submodules',
    '--quiet',
    ...target,
  ];
}

/** "origin/develop<TAB>develop<TAB>2026-10-19" lines, without each remote's HEAD. */
function remoteBranches(refs: readonly string[]): RemoteBranch[] {
  return refs
    .map((line) => line.split('\t'))
    .filter(([, name]) => name && name !== 'HEAD')
    .map(([ref = '', name = '', date = '']) => ({ ref, name, date }))
    .toSorted((a, b) => a.ref.localeCompare(b.ref));
}

async function lines(context: GitContext, repo: Repo, args: readonly string[]): Promise<string[]> {
  const result = await runGit(context, { cwd: repo.root, args });
  return result.code === 0 ? result.stdout.split('\n').filter(Boolean) : [];
}

export function createGitSwitcher(context: GitContext): GitSwitcher {
  return {
    state: async (repo) => {
      const [current, branches, remote, changed] = await Promise.all([
        lines(context, repo, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
        lines(context, repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']),
        lines(context, repo, [
          'for-each-ref',
          '--format=%(refname:lstrip=2)%09%(refname:lstrip=3)%09%(committerdate:short)',
          'refs/remotes/',
        ]),
        lines(context, repo, ['status', '--porcelain=v1', '--untracked-files=no']),
      ]);
      return {
        current: current[0] ?? '',
        branches: branches.toSorted(),
        remote: remoteBranches(remote),
        changed: changed.length,
      } satisfies BranchState;
    },
    switchTo: async (repo, branch, from = '') => {
      const result = await runGit(context, { cwd: repo.root, args: switchArgs(branch, from) });
      if (result.code !== 0) throw new ToolError(gitError(result));
    },
  };
}
