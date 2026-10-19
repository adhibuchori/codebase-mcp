import { expect, test } from 'bun:test';
import { bannerLines, strongEnough, USAGE } from '../banner.ts';

const repos = Array.from({ length: 9 }, (_, index) => ({
  slug: `svc-${index}`,
  root: `/w/svc-${index}`,
  group: index < 5 ? 'shop' : 'billing',
}));

test('the banner names the endpoint, the repos, the search engines and any problem', () => {
  const lines = bannerLines({
    version: '2.0.0',
    runtime: 'bun 1.3.12',
    url: 'http://127.0.0.1:8787',
    repos,
    configSource: 'codebase.config.json',
    ripgrep: '/bin/rg',
    indexEnabled: true,
    branchSwitch: '',
    problems: ['root ~/old does not exist'],
  });
  expect(lines[0]).toBe(
    'codebase-mcp 2.0.0 on bun 1.3.12 · MCP endpoint http://127.0.0.1:8787/mcp · read-only',
  );
  expect(lines[1]).toBe(
    '9 repos in 2 groups from codebase.config.json: svc-0, svc-1, svc-2, svc-3, svc-4, svc-5, svc-6, svc-7, …',
  );
  expect(lines[2]).toBe('Search: ripgrep + background index');
  expect(lines[3]).toBe('warning: root ~/old does not exist');
});

test('without ripgrep, groups or the index the banner says so, and names branch switching', () => {
  const lines = bannerLines({
    version: '2.0.0',
    runtime: 'node 22.18.0',
    url: 'http://x',
    repos: [{ slug: 'a', root: '/a', group: '' }],
    configSource: 'REPOS',
    ripgrep: null,
    indexEnabled: false,
    branchSwitch: 'orders, payments',
    problems: [],
  });
  expect(lines[0]).toBe(
    'codebase-mcp 2.0.0 on node 22.18.0 · MCP endpoint http://x/mcp · read-only except switch_branch',
  );
  expect(lines[1]).toBe('1 repo from REPOS: a');
  expect(lines[2]).toBe(
    'Search: JavaScript scanner (ripgrep unavailable) + no index (disabled in config)',
  );
  expect(lines[3]).toBe(
    'Branch switching: on for orders, payments (local or already fetched branches, never downloads)',
  );
});

test('usage lists the commands; a short key is weak', () => {
  expect(USAGE).toContain('stdio');
  expect(strongEnough('x'.repeat(23))).toBe(false);
  expect(strongEnough('x'.repeat(24))).toBe(true);
});
