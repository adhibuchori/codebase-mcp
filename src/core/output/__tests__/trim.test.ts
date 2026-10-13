import { expect, test } from 'bun:test';
import { numberLines, plural, trimLine } from '../trim.ts';

test('trimLine drops indentation and trailing space', () => {
  expect(trimLine('    return order;   ', 5)).toBe('return order;');
});

test('trimLine keeps a window around the match in a long line', () => {
  const line = `${'a'.repeat(300)}NEEDLE${'b'.repeat(300)}`;
  const trimmed = trimLine(line, 301, 60);
  expect(trimmed).toContain('NEEDLE');
  expect(trimmed.startsWith('…')).toBe(true);
  expect(trimmed.endsWith('…')).toBe(true);
  expect(trimmed.length).toBeLessThanOrEqual(62);
});

test('trimLine keeps the start when the match is near it', () => {
  const trimmed = trimLine(`NEEDLE${'c'.repeat(400)}`, 1, 50);
  expect(trimmed.startsWith('NEEDLE')).toBe(true);
  expect(trimmed.endsWith('…')).toBe(true);
});

test('numberLines right-aligns numbers', () => {
  expect(numberLines(['a', 'b'], 9)).toEqual([' 9: a', '10: b']);
});

test('plural', () => {
  expect(plural(1, 'file')).toBe('1 file');
  expect(plural(3, 'file')).toBe('3 files');
});
