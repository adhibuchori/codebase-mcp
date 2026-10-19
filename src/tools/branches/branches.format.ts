/** switch_branch's answers as plain text. */
import { plural } from '../../core/output/trim.ts';
import type { BranchState } from '../../ports/git.ts';
import type { BranchResult } from './branches.service.ts';

const MAX_LISTED = 60;

function listBranches(state: BranchState): string[] {
  const local = state.branches.map((name) => `${name === state.current ? '*' : ' '} ${name}`);
  const fetched = state.remote
    .filter((remote) => !state.branches.includes(remote.name))
    .map((remote) => `  ${remote.ref} (last commit ${remote.date})`);
  const shownLocal = local.slice(0, MAX_LISTED);
  const shownFetched = fetched.slice(0, Math.max(0, MAX_LISTED - shownLocal.length));
  const hidden = local.length + fetched.length - shownLocal.length - shownFetched.length;
  return [
    ...shownLocal,
    ...(fetched.length > 0
      ? [
          `Fetched remote branches (${fetched.length}); switching to one creates its local branch, with no network:`,
          ...shownFetched,
        ]
      : []),
    ...(hidden > 0 ? [`… and ${hidden} more`] : []),
  ];
}

export function renderBranches(result: BranchResult): string {
  const { repo } = result;
  if (result.kind === 'already') return `${repo.slug} is already on ${result.branch}.`;
  if (result.kind === 'switched') {
    const { created } = result;
    return [
      `${repo.slug} switched from ${result.from || 'a detached HEAD'} to ${result.to}.`,
      ...(created
        ? [
            `${result.to} was created from ${created.ref}, the copy fetched earlier (last commit ${created.date}). Nothing was downloaded; newer commits on the server appear after the owner runs git fetch.`,
          ]
        : []),
      'Every tool now reads this branch. The index catches up in the background; until then a search may miss lines that only this branch has.',
    ].join('\n');
  }
  const { current, branches, changed } = result.state;
  return [
    `${repo.slug}: on ${current || 'a detached HEAD'}, ${plural(branches.length, 'local branch')}${changed > 0 ? `, uncommitted changes in ${plural(changed, 'file')} (switching is refused until they are committed)` : ''}.`,
    ...listBranches(result.state),
    'A branch that is not listed was never fetched; the owner runs git fetch first.',
  ].join('\n');
}
