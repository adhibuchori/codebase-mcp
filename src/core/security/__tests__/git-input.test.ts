import { describe, expect, test } from 'bun:test';
import { ToolError } from '../../errors/tool-error.ts';
import {
  parseLineRange,
  validateBranch,
  validatePickaxe,
  validateRevision,
  validateSince,
} from '../git-input.ts';

describe('validateRevision', () => {
  test.each(['a1b2c3d', 'main', 'release/1.2', 'HEAD~3', 'v2.0.0', 'HEAD^{commit}', 'origin/main'])(
    'accepts %s',
    (rev) => {
      expect(validateRevision(` ${rev} `)).toBe(rev);
    },
  );

  test.each(['--output=/tmp/x', '-p', 'a..b', 'a b', '', 'x'.repeat(201), ';rm'])(
    'refuses %s',
    (rev) => {
      expect(() => validateRevision(rev)).toThrow(ToolError);
    },
  );
});

describe('validateBranch', () => {
  test.each(['main', 'develop', 'release/2.3', 'feature/JIRA-12_fix', 'v2.x'])(
    'accepts %s',
    (name) => {
      expect(validateBranch(` ${name} `)).toBe(name);
    },
  );

  test.each([
    '-f',
    '--force',
    'HEAD~1',
    'main^',
    'a..b',
    'a b',
    'main@{1}',
    'feature/',
    'a//b',
    'x.lock',
    'a/.hidden',
    '',
    'x'.repeat(201),
  ])('refuses %s', (name) => {
    expect(() => validateBranch(name)).toThrow(ToolError);
  });
});

describe('validateSince', () => {
  test('accepts ISO dates and spans', () => {
    expect(validateSince('2026-09-01')).toBe('2026-09-01');
    expect(validateSince('14 days')).toBe('14.days.ago');
    expect(validateSince('2 Weeks')).toBe('2.weeks.ago');
  });

  test('refuses anything else', () => {
    expect(() => validateSince('--all')).toThrow(ToolError);
    expect(() => validateSince('yesterday')).toThrow('not a supported date');
  });
});

test('validatePickaxe keeps one line of reasonable length', () => {
  expect(validatePickaxe('Order already cancelled')).toBe('Order already cancelled');
  expect(() => validatePickaxe('')).toThrow(ToolError);
  expect(() => validatePickaxe('a\nb')).toThrow(ToolError);
  expect(() => validatePickaxe('x'.repeat(201))).toThrow(ToolError);
});

test('parseLineRange clamps and caps', () => {
  expect(parseLineRange('120', 50)).toEqual({ start: 120, end: 120 });
  expect(parseLineRange('120-180', 50)).toEqual({ start: 120, end: 169 });
  expect(parseLineRange(' 0 - 3 ', 50)).toEqual({ start: 1, end: 3 });
  expect(parseLineRange('9-2', 50)).toEqual({ start: 9, end: 9 });
  expect(() => parseLineRange('abc', 50)).toThrow('not a line range');
});
