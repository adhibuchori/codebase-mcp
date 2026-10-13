import { expect, test } from 'bun:test';
import { globToRegex, matchesAnyGlob } from '../glob.ts';

test('a glob without a slash matches the file name anywhere', () => {
  const glob = globToRegex('*.java');
  expect(glob.test('src/main/App.java')).toBe(true);
  expect(glob.test('App.java')).toBe(true);
  expect(glob.test('src/App.kt')).toBe(false);
});

test('** crosses folders, * and ? do not', () => {
  expect(globToRegex('src/**/*.ts').test('src/a/b/c.ts')).toBe(true);
  expect(globToRegex('src/**/*.ts').test('src/c.ts')).toBe(true);
  expect(globToRegex('src/*.ts').test('src/a/c.ts')).toBe(false);
  expect(globToRegex('src/a?.ts').test('src/ab.ts')).toBe(true);
  expect(globToRegex('docs/**').test('docs/a/b.md')).toBe(true);
});

test('braces, a leading ./ and case-insensitivity', () => {
  expect(globToRegex('./src/*.{ts,tsx}').test('src/App.TSX')).toBe(true);
  expect(globToRegex('/build.gradle').test('build.gradle')).toBe(true);
  expect(globToRegex('a}b').test('a}b')).toBe(true);
  expect(globToRegex('a,b').test('a,b')).toBe(true);
});

test('matchesAnyGlob with and without globs', () => {
  expect(matchesAnyGlob('src/a.ts', [])).toBe(true);
  expect(matchesAnyGlob('src/a.ts', [globToRegex('*.go')])).toBe(false);
  expect(matchesAnyGlob('src/a.ts', [globToRegex('*.go'), globToRegex('*.ts')])).toBe(true);
});
