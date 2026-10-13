import { expect, test } from 'bun:test';
import { percentile, references, score, summary } from '../scoring.ts';

test('references keeps order, dedupes files and keeps the first line', () => {
  const text = 'a/b/C.java:12 then a/b/C.java:40 and x/y.go';
  expect(references(text)).toEqual([
    { file: 'a/b/C.java', line: 12 },
    { file: 'x/y.go', line: 0 },
  ]);
  expect(references('header\nrepo/src/A.java\n  29: throw x;\n> 30: y')).toEqual([
    { file: 'repo/src/A.java', line: 29 },
  ]);
});

test('score checks hit@1 and hit@k, with a small line tolerance', () => {
  const scenario = { id: 's', tool: 't', args: {}, expect: ['x/y.go:10'], within: 2 };
  expect(score(scenario, { text: 'a/b.ts\nx/y.go:12', isError: false, ms: 5 })).toMatchObject({
    hit1: false,
    hitK: true,
    tokens: 4,
  });
  expect(score(scenario, { text: 'x/y.go:30', isError: false, ms: 5 }).hitK).toBe(false);
  expect(
    score({ ...scenario, expect: ['x/y.go'] }, { text: 'x/y.go:30', isError: true, ms: 1 }),
  ).toMatchObject({ hit1: true, error: true });
});

test('percentile and summary', () => {
  expect(percentile([5, 1, 3], 50)).toBe(3);
  expect(percentile([], 95)).toBe(0);
  const table = summary([{ id: 'a', hit1: true, hitK: true, tokens: 100, ms: 10, error: false }]);
  expect(table).toContain('| 1 | 100% | 100% | 100 | 10 | 10 |');
});
