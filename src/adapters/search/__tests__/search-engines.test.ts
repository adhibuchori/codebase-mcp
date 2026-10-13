import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Repo } from '../../../core/model/domain.types.ts';
import { createWorkspace, type Workspace } from '../../../testing/helpers/workspace.ts';
import type { TextQuery } from '../../../ports/search.ts';
import { createInventory } from '../../fs/inventory.ts';
import { createNodeFileSystem } from '../../fs/node-file-system.ts';
import { listGitFiles } from '../../git/git-reader.ts';
import { createJsSearcher } from '../js-searcher.ts';
import { bundledRipgrep, locateRipgrep, ripgrepVersion } from '../locate-ripgrep.ts';
import { createRipgrepSearcher } from '../ripgrep-searcher.ts';
import { ToolError } from '../../../core/errors/tool-error.ts';
import { rejectionOf } from '../../../testing/helpers/rejection.ts';

const fs = createNodeFileSystem();
const git = { baseEnv: { PATH: process.env['PATH'] ?? '' }, timeoutMs: 20_000 };
let workspace: Workspace;
let repos: Repo[];
let rgPath = '';

const query = (fields: Partial<TextQuery>): TextQuery => ({
  pattern: '',
  mode: 'literal',
  caseSensitive: false,
  pathGlob: '',
  maxMatches: 100,
  maxPerFile: 10,
  deadline: Date.now() + 20_000,
  ...fields,
});

beforeAll(async () => {
  workspace = createWorkspace({ repos: ['orders-java', 'payments-go'] });
  repos = ['orders-java', 'payments-go'].map((slug) => ({
    slug,
    root: workspace.repoPath(slug),
    group: 'shop',
  }));
  const orders = workspace.repoPath('orders-java');
  mkdirSync(join(orders, 'certs'), { recursive: true });
  writeFileSync(join(orders, 'certs', 'server.pem'), 'Order already cancelled');
  writeFileSync(join(orders, 'blob.bin'), Buffer.from([0, 1, 2, 79, 114, 100, 101, 114]));
  rgPath = (await bundledRipgrep()) ?? '';
});

afterAll(() => workspace.cleanup());

function engines() {
  const inventory = createInventory({
    fs,
    listGitFiles: (root) => listGitFiles(git, root),
    blocked: [],
    exclude: [],
  });
  return {
    js: createJsSearcher({ fs, inventory, maxFileBytes: 1024 * 1024 }),
    rg: createRipgrepSearcher({ rgPath, maxFileBytes: 1024 * 1024, exclude: [], blocked: [] }),
  };
}

describe.each(['js', 'rg'] as const)('%s searcher', (name) => {
  test('finds a literal across repos and never in sensitive or binary files', async () => {
    const result = await engines()[name].scan(repos, query({ pattern: 'Order already cancelled' }));
    expect(result.matches.map((m) => `${m.repo}/${m.path}:${m.line}`)).toEqual([
      'orders-java/src/main/java/com/acme/orders/service/OrderService.java:29',
    ]);
    expect(result.matches[0]?.column).toBe(46);
    expect(result.timedOut).toBe(false);
  });

  test('word mode, case sensitivity and regex', async () => {
    const searcher = engines()[name];
    const word = await searcher.scan(
      repos,
      query({ pattern: 'Refund', mode: 'word', caseSensitive: true }),
    );
    expect(new Set(word.matches.map((m) => m.path))).toEqual(
      new Set(['main.go', 'internal/payment/handler.go', 'internal/payment/service.go']),
    );
    const regex = await searcher.scan(
      repos,
      query({ pattern: 'refund payment %s: %w', mode: 'regex' }),
    );
    expect(regex.matches).toHaveLength(1);
  });

  test('verify searches only the listed files, honouring the path glob', async () => {
    const searcher = engines()[name];
    const [orders, payments] = repos;
    if (!orders || !payments) throw new Error('fixture repos missing');
    const candidates = new Map([
      [orders, ['src/main/java/com/acme/orders/service/OrderService.java', 'pom.xml']],
      [payments, ['main.go']],
    ]);
    const all = await searcher.verify(candidates, query({ pattern: 'order' }));
    expect(new Set(all.matches.map((m) => m.path))).toEqual(
      new Set(['src/main/java/com/acme/orders/service/OrderService.java', 'pom.xml', 'main.go']),
    );
    const javaOnly = await searcher.verify(
      candidates,
      query({ pattern: 'order', pathGlob: '*.java' }),
    );
    expect(new Set(javaOnly.matches.map((m) => m.path))).toEqual(
      new Set(['src/main/java/com/acme/orders/service/OrderService.java']),
    );
  });

  test('a long candidate list is split into several command lines', async () => {
    const [orders] = repos;
    if (!orders) throw new Error('fixture repo missing');
    const missing = Array.from(
      { length: 300 },
      (_, index) => `src/${'deep/'.repeat(20)}Missing${index}.java`,
    );
    const result = await engines()[name].verify(
      new Map([[orders, [...missing, 'src/main/java/com/acme/orders/service/OrderService.java']]]),
      query({ pattern: 'Order already cancelled' }),
    );
    expect(result.matches.map((m) => m.line)).toEqual([29]);
  });

  test('an invalid regex is a tool error that says why', async () => {
    const error = await rejectionOf(
      engines()[name].scan(repos, query({ pattern: '(unclosed', mode: 'regex' })),
    );
    expect(error).toBeInstanceOf(ToolError);
    expect(error.message).toStartWith('Invalid regex:');
  });

  test('stops at the match limit and at the deadline', async () => {
    const searcher = engines()[name];
    const limited = await searcher.scan(repos, query({ pattern: 'e', maxMatches: 3 }));
    expect(limited.matches).toHaveLength(3);
    expect(limited.truncated).toBe(true);
    const late = await searcher.scan(repos, query({ pattern: 'e', deadline: Date.now() - 1 }));
    expect(late.timedOut).toBe(true);
  });
});

test('locateRipgrep prefers RG_PATH, falls back to the bundled binary, and honours disabled', async () => {
  const cwd = workspace.dir;
  expect(
    await locateRipgrep({ configured: '', disabled: true, bundled: bundledRipgrep, cwd }),
  ).toBeNull();
  expect(
    await locateRipgrep({ configured: rgPath, disabled: false, bundled: async () => null, cwd }),
  ).toBe(rgPath);
  expect(
    await locateRipgrep({ configured: '/nope/rg', disabled: false, bundled: bundledRipgrep, cwd }),
  ).toBe(rgPath);
  expect(
    await locateRipgrep({
      configured: '/nope/rg',
      disabled: false,
      bundled: async () => '/also/nope',
      cwd: '/',
    }),
  ).toBeOneOf([null, 'rg']);
  expect(
    await bundledRipgrep(async () => Promise.reject(new Error('Cannot find package'))),
  ).toBeNull();
  expect(await ripgrepVersion(rgPath, cwd)).toStartWith('ripgrep');
  expect(await ripgrepVersion(process.execPath, cwd)).toBeNull();
});
