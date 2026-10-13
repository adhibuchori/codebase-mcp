import { expect, test } from 'bun:test';
import { ensureApiKey, type FileOps } from '../api-key.ts';

function memory(initial: Record<string, string>): FileOps & { files: Map<string, string> } {
  const files = new Map(Object.entries(initial));
  return {
    files,
    read: (path) => files.get(path) ?? '',
    write: (path, text) => void files.set(path, text),
    exists: (path) => files.has(path),
  };
}

test('creates the key file from the example and fills the key', () => {
  const ops = memory({ example: '# comment\nMCP_API_KEY=\nPORT=8787\n' });
  expect(ensureApiKey('env', 'example', ops)).toContain('Generated');
  expect(ops.files.get('env')).toMatch(/^# comment\nMCP_API_KEY=[0-9a-f]{64}\nPORT=8787\n$/);
});

test('keeps a strong key', () => {
  const strong = 'a'.repeat(40);
  const ops = memory({ env: `MCP_API_KEY="${strong}"\n` });
  expect(ensureApiKey('env', 'example', ops)).toContain('kept');
  expect(ops.files.get('env')).toBe(`MCP_API_KEY="${strong}"\n`);
});

test('appends a key when the file has none, and starts from nothing when no file exists', () => {
  const ops = memory({ env: 'PORT=1' });
  ensureApiKey('env', 'example', ops);
  expect(ops.files.get('env')).toMatch(/^PORT=1\nMCP_API_KEY=[0-9a-f]{64}\n$/);
  const empty = memory({});
  ensureApiKey('env', 'example', empty);
  expect(empty.files.get('env')).toMatch(/^MCP_API_KEY=[0-9a-f]{64}\n$/);
});
