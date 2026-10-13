/** Text for git_history: one line per commit, blame grouped by commit, a capped diff for show. */
import { takeBlocks, truncateText } from '../../core/output/budget.ts';
import { plural, trimLine } from '../../core/output/trim.ts';
import type { BlameLine, CommitSummary } from '../../ports/git.ts';
import type { History } from './history.service.ts';

function commitLine(commit: CommitSummary): string {
  return `${commit.sha} ${commit.date} ${commit.author}: ${commit.subject}`;
}

function blameBlocks(lines: readonly BlameLine[]): string[] {
  const blocks: string[] = [];
  let current = '';
  for (const line of lines) {
    if (line.sha !== current) {
      current = line.sha;
      blocks.push(`${line.sha} ${line.date} ${line.author}: ${line.summary}`);
    }
    blocks.push(`  ${line.line}: ${trimLine(line.text, 1)}`);
  }
  return blocks;
}

export function renderHistory(result: History, budget: number): string {
  if (result.action === 'show') {
    const { detail } = result;
    const text = [
      commitLine(detail.summary),
      detail.stat,
      detail.patch,
      detail.patchCut ? '… diff cut; read the files with read_code for the rest.' : '',
    ]
      .filter(Boolean)
      .join('\n');
    return truncateText(text, budget);
  }
  if (result.action === 'blame') {
    return takeBlocks(
      [
        `Blame ${result.repo.slug}/${result.path} (${plural(result.lines.length, 'line')})`,
        ...blameBlocks(result.lines),
      ],
      budget,
    ).text;
  }
  const header = `${result.repo.slug}: ${plural(result.commits.length, 'commit')} for ${result.scope}`;
  const hint =
    result.commits.length === 0
      ? 'No commits. Widen the date, drop the path, or try action "pickaxe" with the text you are after.'
      : 'Next: git_history action "show" with a sha to see its diff.';
  return takeBlocks([header, ...result.commits.map(commitLine), hint], budget).text;
}
