import { describe, expect, test } from 'bun:test';
import { ToolError } from '../../errors/tool-error.ts';
import { blockedReason, isHiddenPath, normalizeRelative } from '../path-rules.ts';

describe('normalizeRelative', () => {
  test('cleans separators, dots and duplicate slashes', () => {
    expect(normalizeRelative('./src//main\\App.java')).toBe('src/main/App.java');
    expect(normalizeRelative('src/a/../b.ts')).toBe('src/b.ts');
    expect(normalizeRelative('')).toBe('');
    expect(normalizeRelative('.')).toBe('');
  });

  test('refuses absolute paths, escapes and NUL bytes', () => {
    expect(() => normalizeRelative('/etc/passwd')).toThrow(ToolError);
    expect(() => normalizeRelative('C:/Windows/win.ini')).toThrow('absolute path');
    expect(() => normalizeRelative('../outside.txt')).toThrow('leaves the repo');
    expect(() => normalizeRelative('a/../../b')).toThrow('leaves the repo');
    expect(() => normalizeRelative('a\0b')).toThrow('Invalid path');
  });
});

describe('blockedReason', () => {
  test('names .git and sensitive segments', () => {
    expect(blockedReason('.git/config', [])).toContain('.git');
    expect(blockedReason('config/.env.local', [])).toContain('sensitive');
    expect(blockedReason('certs/server.pem', [])).toContain('sensitive');
    expect(blockedReason('db/dump.sql', [/\.sql$/])).toContain('sensitive');
  });

  test('allows ordinary paths', () => {
    expect(blockedReason('src/main/App.java', [])).toBe('');
    expect(blockedReason('', [])).toBe('');
  });
});

test('isHiddenPath covers ignored folders and sensitive names', () => {
  expect(isHiddenPath('node_modules/x/index.js', [])).toBe(true);
  expect(isHiddenPath('app/.venv/lib.py', [])).toBe(true);
  expect(isHiddenPath('id_rsa', [])).toBe(true);
  expect(isHiddenPath('src/index.ts', [])).toBe(false);
});
