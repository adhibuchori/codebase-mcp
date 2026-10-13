import { expect, test } from 'bun:test';
import type { TextMatch } from '../../model/domain.types.ts';
import { duplicateLines, groupByFile, type ScoredMatch } from '../group.ts';

const hit = (path: string, line: number, score: number, text = `line ${line}`): ScoredMatch => {
  const match: TextMatch = { repo: 'r', path, line, column: 1, text };
  return { match, score };
};

test('groups by file, best file first, lines in order, with a per-file cap', () => {
  const groups = groupByFile(
    [hit('a.ts', 9, 10), hit('b.ts', 3, 500), hit('a.ts', 2, 50), hit('a.ts', 5, 40)],
    () => 0,
    2,
  );
  expect(groups.map((group) => group.path)).toEqual(['b.ts', 'a.ts']);
  const second = groups[1];
  expect(second?.shown.map((entry) => entry.match.line)).toEqual([2, 5]);
  expect(second?.hidden).toBe(1);
});

test('ties break on the path; flags come from the callback', () => {
  const groups = groupByFile(
    [hit('z.ts', 1, 10), hit('a.ts', 1, 10)],
    (_repo, path) => (path === 'a.ts' ? 1 : 0),
    5,
  );
  expect(groups.map((group) => [group.path, group.flags])).toEqual([
    ['a.ts', 1],
    ['z.ts', 0],
  ]);
});

test('an empty list makes no groups', () => {
  expect(groupByFile([], () => 0, 3)).toEqual([]);
});

test('duplicateLines counts identical lines across files', () => {
  const groups = groupByFile(
    [hit('a.ts', 1, 1, ' same '), hit('b.ts', 1, 1, 'same'), hit('b.ts', 2, 1, 'other')],
    () => 0,
    5,
  );
  const counts = duplicateLines(groups);
  expect(counts.get('same')).toBe(2);
  expect(counts.get('other')).toBe(1);
});
