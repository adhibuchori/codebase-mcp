import { expect, test } from 'bun:test';
import type { TextMatch } from '../../model/domain.types.ts';
import { FLAG_DOCS, FLAG_TEST } from '../classify.ts';
import { isWholeWord, penaltyFor, scoreFile, scoreMatch } from '../score.ts';

const match = (text: string, column: number, path = 'src/a.ts', line = 1): TextMatch => ({
  repo: 'r',
  path,
  line,
  column,
  text,
});

test('isWholeWord looks at both neighbours', () => {
  expect(isWholeWord('call cancel();', 6, 6)).toBe(true);
  expect(isWholeWord('call cancelOrder();', 6, 6)).toBe(false);
  expect(isWholeWord('xcancel', 2, 6)).toBe(false);
  expect(isWholeWord('cancel', 1, 6)).toBe(true);
});

test('penalties for tests, docs and plain files', () => {
  expect(penaltyFor(FLAG_TEST)).toBe(0.2);
  expect(penaltyFor(FLAG_DOCS)).toBe(0.5);
  expect(penaltyFor(0)).toBe(1);
});

test('definitions outrank whole words, which outrank partial hits', () => {
  const none = new Set<number>();
  const definition = scoreMatch(match('void cancel() {', 6, 'src/a.ts', 7), {
    needle: 'cancel',
    definitionLines: new Set([7]),
    flags: 0,
  });
  const whole = scoreMatch(match('call cancel();', 6), {
    needle: 'cancel',
    definitionLines: none,
    flags: 0,
  });
  const partial = scoreMatch(match('call cancelOrder();', 6), {
    needle: 'cancel',
    definitionLines: none,
    flags: 0,
  });
  expect(definition).toBeGreaterThan(whole);
  expect(whole).toBeGreaterThan(partial);
});

test('a file named like the needle gets a bonus; a regex has no needle', () => {
  const none = new Set<number>();
  const named = scoreMatch(match('x', 1, 'src/Cancel.ts'), {
    needle: 'cancel',
    definitionLines: none,
    flags: 0,
  });
  const other = scoreMatch(match('x', 1, 'src/Other.ts'), {
    needle: 'cancel',
    definitionLines: none,
    flags: 0,
  });
  expect(named).toBeGreaterThan(other);
  expect(scoreMatch(match('abc', 1), { needle: '', definitionLines: none, flags: 0 })).toBe(50);
});

test('scoreFile adds a small bonus for more matches', () => {
  expect(scoreFile([])).toBe(0);
  expect(scoreFile([100, 50])).toBeGreaterThan(scoreFile([100]));
});
