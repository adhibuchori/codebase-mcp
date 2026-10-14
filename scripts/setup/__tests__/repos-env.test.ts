import { expect, test } from 'bun:test';
import { parseDotEnv } from '../../../src/config/dotenv.ts';
import type { FileOps } from '../api-key.ts';
import { addRepos, parseRepoInput } from '../repos-env.ts';

const PATHS = { env: 'env', example: 'example' };

function memory(initial: Record<string, string>): FileOps & { files: Map<string, string> } {
  const files = new Map(Object.entries(initial));
  return {
    files,
    read: (path) => files.get(path) ?? '',
    write: (path, text) => void files.set(path, text),
    exists: (path) => files.has(path),
  };
}

test('parseRepoInput reads name=path and bare paths, named after their folder', () => {
  expect(parseRepoInput(' /work/orders-api/ ; web = C:\\work\\web-app ;; =nope; ')).toEqual([
    { name: 'orders-api', path: '/work/orders-api/' },
    { name: 'web', path: 'C:\\work\\web-app' },
  ]);
  expect(parseRepoInput('')).toEqual([]);
});

test('adds to REPOS in place, keeping every other line', () => {
  const ops = memory({ env: 'MCP_API_KEY=k\nREPOS=mobile=/work/mobile-app\nPORT=8787\n' });
  const result = addRepos(PATHS, [{ name: 'orders', path: '/work/orders' }], ops);
  expect(result).toEqual({ added: [{ name: 'orders', path: '/work/orders' }], alreadyListed: [] });
  expect(ops.files.get('env')).toBe(
    'MCP_API_KEY=k\nREPOS=mobile=/work/mobile-app;orders=/work/orders\nPORT=8787\n',
  );
  expect(parseDotEnv(ops.files.get('env') ?? '').get('REPOS')).toBe(
    'mobile=/work/mobile-app;orders=/work/orders',
  );
});

test('a folder already listed is not added twice, and a taken name gets a suffix', () => {
  const ops = memory({ env: 'REPOS="app=/work/a"\n' });
  const result = addRepos(
    PATHS,
    [
      { name: 'again', path: '/work/a/' },
      { name: 'app', path: '/work/b' },
    ],
    ops,
  );
  expect(result.alreadyListed).toEqual(['/work/a/']);
  expect(result.added).toEqual([{ name: 'app-2', path: '/work/b' }]);
  expect(ops.files.get('env')).toBe('REPOS=app=/work/a;app-2=/work/b\n');
});

test('nothing new leaves the file untouched', () => {
  const ops = memory({ env: 'REPOS=app=/work/a' });
  expect(addRepos(PATHS, [{ name: 'x', path: '/work/a' }], ops).added).toEqual([]);
  expect(ops.files.get('env')).toBe('REPOS=app=/work/a');
});

test('a commented REPOS does not count; the line is appended, from the example when needed', () => {
  const ops = memory({ example: '# REPOS=core=/x\nMCP_API_KEY=' });
  addRepos(PATHS, [{ name: 'core', path: '/work/core' }], ops);
  expect(ops.files.get('env')).toBe('# REPOS=core=/x\nMCP_API_KEY=\nREPOS=core=/work/core\n');
  const empty = memory({});
  addRepos(PATHS, [{ name: 'core', path: '/work/core' }], empty);
  expect(empty.files.get('env')).toBe('REPOS=core=/work/core\n');
});
