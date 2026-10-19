/**
 * switch_branch's work: list a repo's local branches, or switch it to one. Every refusal happens
 * here, before git runs: the repo must be allowed by ALLOW_BRANCH_SWITCH, the branch must already
 * exist locally, and the repo must have no uncommitted changes, so a switch never loses work.
 */
import { ToolError } from '../../core/errors/tool-error.ts';
import type { Repo } from '../../core/model/domain.types.ts';
import { allowsSwitch } from '../../core/security/branch-switch.ts';
import { validateBranch } from '../../core/security/git-input.ts';
import { requireRepo } from '../../engine/repo-scope.ts';
import type { BranchState } from '../../ports/git.ts';
import type { ToolContext } from '../registry/define-tool.ts';

export interface BranchArgs {
  readonly repo: string;
  readonly branch?: string | undefined;
}

export type BranchResult =
  | { readonly kind: 'list'; readonly repo: Repo; readonly state: BranchState }
  | { readonly kind: 'already'; readonly repo: Repo; readonly branch: string }
  | { readonly kind: 'switched'; readonly repo: Repo; readonly from: string; readonly to: string };

function refuseUnlessReady(repo: Repo, state: BranchState, branch: string): void {
  if (!state.branches.includes(branch)) {
    throw new ToolError(
      `Branch "${branch}" does not exist in ${repo.slug} on this machine.`,
      'Only local branches can be used; the owner fetches a remote branch first. Call switch_branch without "branch" to list them.',
    );
  }
  if (state.changed > 0) {
    throw new ToolError(
      `${repo.slug} has uncommitted changes in ${state.changed} file(s), so the switch was refused to keep them safe.`,
      'The owner commits or stashes them first.',
    );
  }
}

export async function switchBranch(args: BranchArgs, context: ToolContext): Promise<BranchResult> {
  const { deps } = context;
  const repo = requireRepo(deps.repos, args.repo);
  if (!allowsSwitch(deps.branchSwitch, repo.slug))
    throw new ToolError(
      `Branch switching is not allowed for ${repo.slug}.`,
      'The owner can allow it with ALLOW_BRANCH_SWITCH.',
    );
  if (!(await deps.git.isRepo(repo))) throw new ToolError(`${repo.slug} is not a git repository.`);
  const state = await deps.switcher.state(repo);
  if (!args.branch) return { kind: 'list', repo, state };
  const branch = validateBranch(args.branch);
  if (branch === state.current) return { kind: 'already', repo, branch };
  refuseUnlessReady(repo, state, branch);
  await deps.switcher.switchTo(repo, branch);
  deps.logger.info('branch switched', { repo: repo.slug, from: state.current, to: branch });
  deps.reindex(repo);
  return { kind: 'switched', repo, from: state.current, to: branch };
}
