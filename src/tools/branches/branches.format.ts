/** switch_branch's answers as plain text. */
import { plural } from '../../core/output/trim.ts';
import type { BranchResult } from './branches.service.ts';

const MAX_LISTED = 60;

export function renderBranches(result: BranchResult): string {
  const { repo } = result;
  if (result.kind === 'already') return `${repo.slug} is already on ${result.branch}.`;
  if (result.kind === 'switched') {
    return [
      `${repo.slug} switched from ${result.from || 'a detached HEAD'} to ${result.to}.`,
      'Every tool now reads this branch. The index catches up in the background; until then a search may miss lines that only this branch has.',
    ].join('\n');
  }
  const { current, branches, changed } = result.state;
  const shown = branches
    .slice(0, MAX_LISTED)
    .map((name) => `${name === current ? '*' : ' '} ${name}`);
  return [
    `${repo.slug}: on ${current || 'a detached HEAD'}, ${plural(branches.length, 'local branch')}${changed > 0 ? `, uncommitted changes in ${plural(changed, 'file')} (switching is refused until they are committed)` : ''}.`,
    ...shown,
    ...(branches.length > MAX_LISTED ? [`… and ${branches.length - MAX_LISTED} more`] : []),
    'A branch that exists only on the remote has to be fetched by the owner first.',
  ].join('\n');
}
