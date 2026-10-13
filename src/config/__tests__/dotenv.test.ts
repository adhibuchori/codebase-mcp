import { expect, test } from 'bun:test';
import { parseDotEnv } from '../dotenv.ts';

test('parses keys, strips quotes and skips comments and blank lines', () => {
  const values = parseDotEnv(
    [
      '# comment',
      'MCP_API_KEY=abc',
      'PORT = 8787 ',
      'QUOTED="a b"',
      "SINGLE='x'",
      '',
      '  # indented comment',
      'not a pair',
      'EMPTY=',
    ].join('\r\n'),
  );
  expect(Object.fromEntries(values)).toEqual({
    MCP_API_KEY: 'abc',
    PORT: '8787',
    QUOTED: 'a b',
    SINGLE: 'x',
    EMPTY: '',
  });
});

test('a lone quote is kept', () => {
  expect(parseDotEnv('A="').get('A')).toBe('"');
});
