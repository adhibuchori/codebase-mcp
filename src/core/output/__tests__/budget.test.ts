import { describe, expect, test } from 'bun:test';
import { estimateTokens, pickLevel, takeBlocks, tokensToChars, truncateText } from '../budget.ts';

test('token and character conversions', () => {
  expect(tokensToChars(100)).toBe(400);
  expect(tokensToChars(0)).toBe(1);
  expect(estimateTokens('abcdefgh')).toBe(2);
});

describe('truncateText', () => {
  test('returns text within budget unchanged', () => {
    expect(truncateText('short', 100)).toBe('short');
  });

  test('cuts at a line break and says so', () => {
    const text = Array.from({ length: 50 }, (_, i) => `line ${i} ${'x'.repeat(20)}`).join('\n');
    const cut = truncateText(text, 300);
    expect(cut.length).toBeLessThanOrEqual(300);
    expect(cut).toContain('cut to fit the response budget');
    expect(cut.split('\n').at(-2)).toMatch(/^line \d+ x+$/);
  });

  test('cuts mid-line when there is no usable line break', () => {
    const cut = truncateText('y'.repeat(500), 120);
    expect(cut.startsWith('y')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(120);
  });
});

describe('pickLevel', () => {
  test('renders lazily and returns the first level that fits', () => {
    let rendered = 0;
    const level = (text: string) => () => {
      rendered++;
      return text;
    };
    expect(pickLevel([level('x'.repeat(50)), level('short'), level('never')], 10)).toBe('short');
    expect(rendered).toBe(2);
  });

  test('truncates the last level when none fits', () => {
    const result = pickLevel([() => 'a'.repeat(500), () => 'b'.repeat(400)], 200);
    expect(result.startsWith('b')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(200);
  });
});

describe('takeBlocks', () => {
  test('keeps whole blocks while they fit', () => {
    expect(takeBlocks(['aaaa', 'bbbb', 'cccc'], 9)).toEqual({ text: 'aaaa\nbbbb', used: 2 });
  });

  test('truncates a single oversized first block', () => {
    const result = takeBlocks(['z'.repeat(500)], 150);
    expect(result.used).toBe(1);
    expect(result.text.length).toBeLessThanOrEqual(150);
  });

  test('handles no blocks', () => {
    expect(takeBlocks([], 10)).toEqual({ text: '', used: 0 });
  });
});
