import { describe, expect, test } from 'bun:test';
import { requiredLiterals, trigramMatch, trigramsOf } from '../trigrams.ts';

test('trigramsOf is lower-case and distinct', () => {
  expect(trigramsOf('AbAbA')).toEqual(['aba', 'bab']);
  expect(trigramsOf('ab')).toEqual([]);
});

test('trigramMatch ANDs quoted trigrams of every literal', () => {
  expect(trigramMatch(['cancel'])).toBe('"can" AND "anc" AND "nce" AND "cel"');
  expect(trigramMatch(['ab', 'x"yz'])).toBe('"x""y" AND """yz"');
  expect(trigramMatch(['ab'])).toBe('');
});

describe('requiredLiterals', () => {
  test.each([
    ['cancelOrder\\(', ['cancelOrder(']],
    ['throw new \\w+Exception', ['throw new ', 'Exception']],
    ['^\\s*log\\.warn', ['log.warn']],
    ['abc?def', ['def']],
    ['ab+cde', ['bcde']],
    ['xyz{2}abc', ['xyz', 'zabc']],
    ['abcd{0,3}efg', ['abc', 'efg']],
    ['abc*?def', ['def']],
    ['[abc]defg', ['defg']],
    ['(?:group)tail', ['tail']],
    ['((nested))end', ['end']],
    ['a.b.c', []],
    ['one|two', []],
    ['wor\\d', ['wor']],
  ])('%s', (pattern, expected) => {
    expect(requiredLiterals(pattern)).toEqual(expected);
  });

  test('every match of the regex contains each returned literal', () => {
    const pattern = 'pay(ment)?Failed\\s+for\\s+order';
    const literals = requiredLiterals(pattern);
    for (const sample of ['payFailed for order', 'paymentFailed  for\torder']) {
      expect(new RegExp(pattern).test(sample)).toBe(true);
      for (const literal of literals) expect(sample.includes(literal)).toBe(true);
    }
  });
});
