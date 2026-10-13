import { expect, test } from 'bun:test';
import { ToolError } from '../../errors/tool-error.ts';
import { assertSafeRegex, compileRegex, escapeRegex } from '../safe-regex.ts';

test('accepts ordinary patterns', () => {
  expect(() => assertSafeRegex('cancel(Order|Payment)\\(')).not.toThrow();
  expect(() => assertSafeRegex('^\\s*throw new \\w+Exception')).not.toThrow();
});

test('refuses nested quantifiers, alternation under a quantifier and back-references', () => {
  for (const pattern of ['(a+)+$', '(a|aa)*', '(\\w*){2,}', '(x)\\1', '(?<n>a)\\k<n>']) {
    expect(() => assertSafeRegex(pattern)).toThrow(ToolError);
  }
});

test('refuses very long patterns', () => {
  expect(() => assertSafeRegex('a'.repeat(301))).toThrow('longer than');
});

test('compileRegex turns a syntax error into a ToolError', () => {
  expect(compileRegex('a+b', 'i').test('AAB')).toBe(true);
  expect(() => compileRegex('(unclosed', '')).toThrow('Invalid regex');
});

test('escapeRegex escapes every special character', () => {
  const special = '.*+?^${}()|[]\\';
  expect(new RegExp(escapeRegex(special)).test(special)).toBe(true);
});
