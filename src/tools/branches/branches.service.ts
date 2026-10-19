/**
 * switch_branch's work: list a repo's branches, or switch it to one. A branch is local, or created
 * from a remote branch already fetched to this machine, which needs no network; anything else is
 * refused. Every refusal happens here, before git runs: the repo must be allowed by
 * ALLOW_BRANCH_SWITCH, the branch must be on this machine, and the repo must have no uncommitted
 * changes, so a switch never loses work.
 */
import { ToolError } from '../../core/errors/tool-error.ts';
import type { Repo } from '../../core/model/domain.types.ts';
import { allowsSwitch } from '../../core/security/branch-switch.ts';
import { validateBranch } from '../../core/security/git-input.ts';
import { requireRepo } from '../../engine/repo-scope.ts';
import type { BranchState, RemoteBranch } from '../../ports/git.ts';
import type { ToolContext } from '../registry/define-tool.ts';

export interface BranchArgs {
  readonly repo: string;
  readonly branch?: string | undefined;
}

export type BranchResult =
  | { readonly kind: 'list'; readonly repo: Repo; readonly state: BranchState }
  | { readonly kind: 'already'; readonly repo: Repo; readonly branch: string }
  | {
      readonly kind: 'switched';
      readonly repo: Repo;
      readonly from: string;
      readonly to: string;
      /** The fetched remote branch the local one was created from, when it was new. */
      readonly created?: RemoteBranch | undefined;
    };

interface Target {
  readonly branch: string;
  readonly created?: RemoteBranch | undefined;
}

/** "develop" or "origin/develop" to a local branch, or to the fetched remote branch to create it from. */
function resolveTarget(repo: Repo, state: BranchState, wanted: string): Target {
  const byRef = state.remote.find((remote) => remote.ref === wanted);
  const branch = byRef ? byRef.name : wanted;
  if (state.branches.includes(branch)) return { branch };
  const matches = byRef ? [byRef] : state.remote.filter((remote) => remote.name === branch);
  if (matches.length === 1) return { branch, created: matches[0] };
  if (matches.length > 1)
    throw new ToolError(
      `"${branch}" was fetched from several remotes: ${matches.map((m) => m.ref).join(', ')}.`,
      `Name one, e.g. {"branch": "${matches[0]?.ref ?? ''}"}.`,
    );
  throw new ToolError(
    `Branch "${branch}" is not on this machine: ${repo.slug} has no such local branch, and no remote branch of that name was ever fetched.`,
    'Nothing is downloaded by this tool; the owner runs git fetch first. Call switch_branch without "branch" to list what is here.',
  );
}

function refuseChanges(repo: Repo, state: BranchState): void {
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
  const { branch, created } = resolveTarget(repo, state, validateBranch(args.branch));
  if (branch === state.current) return { kind: 'already', repo, branch };
  refuseChanges(repo, state);
  await deps.switcher.switchTo(repo, branch, created?.ref);
  deps.logger.info('branch switched', {
    repo: repo.slug,
    from: state.current,
    to: branch,
    ...(created ? { created: created.ref } : {}),
  });
  deps.reindex(repo);
  return { kind: 'switched', repo, from: state.current, to: branch, created };
}
