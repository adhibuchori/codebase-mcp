import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { startTestRuntime, type TestRuntime } from '../../../testing/helpers/test-runtime.ts';
import { createWorkspace, type Workspace } from '../../../testing/helpers/workspace.ts';

let workspace: Workspace;
let app: TestRuntime;

beforeAll(async () => {
  workspace = createWorkspace();
  app = await startTestRuntime(workspace);
});

afterAll(async () => {
  await app.close();
  workspace.cleanup();
});

describe('search_code', () => {
  test('a literal across every repo, with the enclosing symbol', async () => {
    const { text } = await app.call('search_code', { query: 'Order already cancelled' });
    expect(text).toStartWith(
      '"Order already cancelled": 1 match in 1 file across 1 repo (searched 6 repos, 6 through the index)',
    );
    expect(text).toContain(
      '29: throw new IllegalStateException("Order already cancelled");  · in OrderService.cancel',
    );
  });

  test('definitions rank first; tests can be left out', async () => {
    const word = await app.call('search_code', {
      query: 'cancel',
      mode: 'word',
      repos: ['orders-java'],
      detail: 'brief',
    });
    expect(word.text.split('\n')[1]).toBe(
      'orders-java/src/main/java/com/acme/orders/api/OrderController.java',
    );
    const withTests = await app.call('search_code', { query: 'cancellingTwiceFails' });
    expect(withTests.text).toContain('[test]');
    expect(
      (await app.call('search_code', { query: 'cancellingTwiceFails', include_tests: false })).text,
    ).toContain('No matches');
  });

  test('regex mode, a path glob, and a group', async () => {
    const regex = await app.call('search_code', {
      query: 'refund payment %s: %w',
      mode: 'regex',
      path: '*.go',
      group: 'shop',
    });
    expect(regex.text).toContain('payments-go/internal/payment/service.go');
    const invalid = await app.call('search_code', {
      query: '(unclosed',
      mode: 'regex',
      repos: ['payments-go'],
    });
    expect(invalid.isError).toBe(true);
    const group = await app.call('search_code', { query: 'x', group: 'nope' });
    expect(group.text).toContain('No repo in group "nope".');
    expect(group.text).toContain('Groups: shop.');
  });

  test('a group filter when no repo has a group says so', async () => {
    const solo = createWorkspace({ repos: ['payments-go'] });
    const config = { roots: [], repos: [{ name: 'solo', path: solo.repoPath('payments-go') }] };
    const ungrouped = await startTestRuntime(solo, { index: false, config });
    expect((await ungrouped.call('search_code', { query: 'x', group: 'any' })).text).toContain(
      'No repo has a group.',
    );
    await ungrouped.close();
    solo.cleanup();
  });

  test('pages through files with a cursor', async () => {
    const first = await app.call('search_code', { query: 'order', limit: 2 });
    const cursor = /cursor="([^"]+)"/.exec(first.text)?.[1];
    expect(cursor).toBeDefined();
    const second = await app.call('search_code', { query: 'order', limit: 2, cursor });
    expect(second.text).toContain('files 3–4');
    const reused = await app.call('search_code', { query: 'other', limit: 2, cursor });
    expect(reused.isError).toBe(true);
  });

  test('steps down to fit a tiny budget', async () => {
    const tiny = await startTestRuntime(workspace, {
      config: { limits: { maxResponseTokens: 500 } },
      index: false,
    });
    const { text } = await tiny.call('search_code', { query: 'e', detail: 'full', limit: 50 });
    expect(text.length).toBeLessThanOrEqual(2000);
    await tiny.close();
  });
});
