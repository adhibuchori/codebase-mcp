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

describe('list_repos', () => {
  test('one line per service, grouped, with languages, frameworks and endpoints', async () => {
    const { text, isError } = await app.call('list_repos', {});
    expect(isError).toBe(false);
    expect(text).toStartWith('6 repos · index ready for 6');
    expect(text).toContain('[shop]');
    expect(text).toMatch(
      /- orders-java {2}java 100% · spring-boot, spring-cloud-openfeign, spring-kafka · 10 files · 2 endpoints · 1 topic · \d{4}-\d{2}-\d{2} "feat: import orders-java" · ready/,
    );
    expect(text).toContain('- payments-go  go 100% · gin, kafka-go');
  });

  test('filters by name, group and language', async () => {
    expect((await app.call('list_repos', { query: 'pay' })).text).toStartWith('1 repo (of 6)');
    expect((await app.call('list_repos', { group: 'SHOP' })).text).toStartWith('6 repos');
    expect((await app.call('list_repos', { language: 'python' })).text).toContain(
      'notifications-python',
    );
    expect((await app.call('list_repos', { query: 'nothing' })).text).toContain('No repo matches');
  });

  test('a foreign cursor is refused', async () => {
    const { text, isError } = await app.call('list_repos', { cursor: 'bm9wZQ' });
    expect(isError).toBe(true);
    expect(text).toContain('different request');
  });
});

describe('repo_overview', () => {
  test('facts, key files, endpoints, topics and folders', async () => {
    const { text } = await app.call('repo_overview', { repo: 'orders-java' });
    expect(text).toContain('orders-java (group shop) · java 100% · spring-boot');
    expect(text).toContain('Key files: pom.xml, src/main/resources/application.yml');
    expect(text).toContain('Endpoints (2): GET /api/orders/{id}, POST /api/orders/{id}/cancel');
    expect(text).toContain('Produces topics: orders.cancelled');
    expect(text).toContain('  src/ (9)');
  });

  test('zooms into a folder and explains a wrong one', async () => {
    expect(
      (await app.call('repo_overview', { repo: 'orders-java', path: 'src/main', depth: 4 })).text,
    ).toContain('Folders under src/main/');
    const missing = await app.call('repo_overview', { repo: 'orders-java', path: 'nope' });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('No folder "nope"');
    expect((await app.call('repo_overview', { repo: 'payments-go' })).text).toContain(
      'Consumes topics: orders.cancelled',
    );
  });

  test('an unknown repo suggests close names', async () => {
    const { text, isError } = await app.call('repo_overview', { repo: 'orders' });
    expect(isError).toBe(true);
    expect(text).toContain('Did you mean: orders-java');
    expect((await app.call('repo_overview', { repo: 'zzz' })).text).toContain('Call list_repos');
  });
});

describe('before the index is ready, and outside git', () => {
  test('cards and overviews come from the file list; a plain folder has no last commit', async () => {
    const plain = createWorkspace({ git: false, repos: ['payments-go', 'contracts-proto'] });
    const config = {
      roots: [],
      repos: [
        { name: 'payments-go', path: plain.repoPath('payments-go'), group: 'pay' },
        { name: 'contracts-proto', path: plain.repoPath('contracts-proto') },
      ],
    };
    const cold = await startTestRuntime(plain, { index: false, config });
    const { text } = await cold.call('list_repos', {});
    expect(text).toContain('[pay]\n- payments-go  go 100%');
    expect(text).toContain('[no group]\n- contracts-proto  proto 100% · 1 file · not indexed');
    expect((await cold.call('repo_overview', { repo: 'payments-go' })).text).toContain(
      'internal/ (3)',
    );
    await cold.close();
    plain.cleanup();
  });
});
