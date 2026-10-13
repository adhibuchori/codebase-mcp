import { expect, test } from 'bun:test';
import {
  baseName,
  clampWindow,
  extensionOf,
  lineNumberAt,
  looksBinary,
  matchLines,
  splitLines,
  windowAround,
} from '../lines.ts';

test('splitLines handles CRLF and a trailing newline', () => {
  expect(splitLines('a\r\nb\n')).toEqual(['a', 'b']);
  expect(splitLines('')).toEqual(['']);
  expect(splitLines('x')).toEqual(['x']);
});

test('looksBinary detects NUL bytes', () => {
  expect(looksBinary(new Uint8Array([65, 0, 66]))).toBe(true);
  expect(looksBinary(new Uint8Array([65, 66]))).toBe(false);
});

test('windows are clamped to the file', () => {
  expect(clampWindow(10, -5, 4)).toEqual({ start: 1, end: 4 });
  expect(clampWindow(10, 8, 50)).toEqual({ start: 8, end: 10 });
  expect(clampWindow(0, 1, 5)).toEqual({ start: 1, end: 0 });
  expect(windowAround(100, 50, 5)).toEqual({ start: 45, end: 55 });
});

test('path helpers', () => {
  expect(extensionOf('src/App.JAVA')).toBe('.java');
  expect(extensionOf('Dockerfile')).toBe('');
  expect(extensionOf('.gitignore')).toBe('');
  expect(baseName('a/b/c.ts')).toBe('c.ts');
  expect(baseName('c.ts')).toBe('c.ts');
});

test('lineNumberAt counts newlines before an offset', () => {
  const text = 'a\nbb\nccc';
  expect(lineNumberAt(text, 0)).toBe(1);
  expect(lineNumberAt(text, 2)).toBe(2);
  expect(lineNumberAt(text, 7)).toBe(3);
});

test('matchLines reports groups and 1-based lines, with or without the g flag', () => {
  const text = 'get("/a")\nnoise\npost("/b")\n';
  const found = matchLines(text, /(get|post)\("([^"]+)"\)/);
  expect(found.map((m) => [m.groups[1], m.groups[2], m.line])).toEqual([
    ['get', '/a', 1],
    ['post', '/b', 3],
  ]);
  expect(matchLines(text, /noise/g)[0]?.line).toBe(2);
});
