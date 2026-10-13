import { expect, test } from 'bun:test';
import { compileMatcher, smartCase } from '../matcher.ts';
import { ripgrepArgs } from '../rg-args.ts';
import { byteToColumn, parseRgLine } from '../rg-json.ts';

const base = {
  pattern: '-p',
  mode: 'literal' as const,
  caseSensitive: false,
  pathGlob: '',
  maxMatches: 10,
  maxPerFile: 3,
  deadline: 0,
};

test('ripgrepArgs protects the pattern and excludes secrets', () => {
  const args = ripgrepArgs(base, { maxFileBytes: 1000, exclude: ['dist/**'] });
  expect(args.slice(0, 4)).toEqual(['--json', '--no-config', '--hidden', '--no-messages']);
  expect(args).toContain('--fixed-strings');
  expect(args).toContain('--ignore-case');
  expect(args.at(-2)).toBe('-e');
  expect(args.at(-1)).toBe('-p');
  expect(args).toContain('!**/.env.*');
  expect(args).toContain('!dist/**');
});

test('ripgrepArgs for word and regex modes and a path glob', () => {
  const word = ripgrepArgs(
    { ...base, mode: 'word', caseSensitive: true, pathGlob: '*.go' },
    { maxFileBytes: 1, exclude: [] },
  );
  expect(word).toContain('--word-regexp');
  expect(word).toContain('--case-sensitive');
  expect(word).toContain('*.go');
  expect(ripgrepArgs({ ...base, mode: 'regex' }, { maxFileBytes: 1, exclude: [] })).not.toContain(
    '--fixed-strings',
  );
});

test('parseRgLine reads match messages and nothing else', () => {
  const message = {
    type: 'match',
    data: {
      path: { text: './src/a.ts' },
      lines: { text: 'const x = 1;\n' },
      line_number: 4,
      submatches: [{ start: 6 }],
    },
  };
  expect(parseRgLine(JSON.stringify(message))).toEqual({
    path: 'src/a.ts',
    line: 4,
    column: 7,
    text: 'const x = 1;',
  });
  expect(parseRgLine(JSON.stringify({ type: 'begin', data: {} }))).toBeNull();
  expect(parseRgLine('not json')).toBeNull();
  expect(
    parseRgLine(JSON.stringify({ type: 'match', data: { path: { bytes: 'AA==' } } })),
  ).toBeNull();
  const noSubmatch = {
    type: 'match',
    data: { path: { text: 'b' }, lines: { text: 'x' }, line_number: 1 },
  };
  expect(parseRgLine(JSON.stringify(noSubmatch))?.column).toBe(1);
  const windows = { type: 'match', data: { ...message.data, path: { text: '.\\src\\a.ts' } } };
  expect(parseRgLine(JSON.stringify(windows))?.path).toBe('src/a.ts');
});

test('byteToColumn converts byte offsets in non-ASCII lines', () => {
  expect(byteToColumn('const x = "héllo world";', 18)).toBe(18);
  expect(byteToColumn('plain', 2)).toBe(3);
});

test('compileMatcher for each mode', () => {
  expect(
    compileMatcher({ pattern: 'Cancel', mode: 'literal', caseSensitive: false })('void CANCEL()'),
  ).toBe(6);
  expect(
    compileMatcher({ pattern: 'Cancel', mode: 'literal', caseSensitive: true })('void cancel()'),
  ).toBe(0);
  expect(
    compileMatcher({ pattern: 'cancel', mode: 'word', caseSensitive: false })(
      'cancelOrder(); cancel();',
    ),
  ).toBe(16);
  expect(
    compileMatcher({ pattern: 'can+cel', mode: 'regex', caseSensitive: false })('x cannncel'),
  ).toBe(3);
  expect(() => compileMatcher({ pattern: '(a+)+', mode: 'regex', caseSensitive: false })).toThrow(
    'exponential',
  );
});

test('smartCase', () => {
  expect(smartCase('order')).toBe(false);
  expect(smartCase('Order')).toBe(true);
});
