/**
 * Groups scored matches by file, best file first, with a cap on lines per file so one noisy file
 * cannot fill the whole answer. Identical lines in different files are folded into a count.
 */
import type { TextMatch } from '../model/domain.types.ts';
import { scoreFile } from './score.ts';

export interface ScoredMatch {
  readonly match: TextMatch;
  readonly score: number;
}

export interface FileGroup {
  readonly repo: string;
  readonly path: string;
  readonly flags: number;
  readonly score: number;
  readonly shown: readonly ScoredMatch[];
  readonly hidden: number;
}

export function groupByFile(
  scored: readonly ScoredMatch[],
  flagsOf: (repo: string, path: string) => number,
  maxPerFile: number,
): FileGroup[] {
  const byFile = new Map<string, ScoredMatch[]>();
  for (const entry of scored) {
    const key = `${entry.match.repo}\u0000${entry.match.path}`;
    const list = byFile.get(key);
    if (list) list.push(entry);
    else byFile.set(key, [entry]);
  }
  const groups = [...byFile.values()].map((entries) => toGroup(entries, flagsOf, maxPerFile));
  return groups.toSorted(
    (a, b) => b.score - a.score || compareText(`${a.repo}/${a.path}`, `${b.repo}/${b.path}`),
  );
}

function toGroup(
  entries: readonly ScoredMatch[],
  flagsOf: (repo: string, path: string) => number,
  maxPerFile: number,
): FileGroup {
  const first = entries[0]?.match ?? { repo: '', path: '' };
  const best = entries
    .toSorted((a, b) => b.score - a.score || a.match.line - b.match.line)
    .slice(0, maxPerFile);
  return {
    repo: first.repo,
    path: first.path,
    flags: flagsOf(first.repo, first.path),
    score: scoreFile(entries.map((entry) => entry.score)),
    shown: best.toSorted((a, b) => a.match.line - b.match.line),
    hidden: Math.max(0, entries.length - maxPerFile),
  };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Counts how many other files hold exactly the same trimmed line, keyed by that line. */
export function duplicateLines(groups: readonly FileGroup[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const group of groups) {
    for (const line of new Set(group.shown.map((entry) => entry.match.text.trim()))) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  return counts;
}
