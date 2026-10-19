import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { startTestRuntime, type TestRuntime } from '../../../testing/helpers/test-runtime.ts';
import {
  commitAll,
  createWorkspace,
  git,
  type Workspace,
} from '../../../testing/helpers/workspace.ts';
import { buildMcpServer } from '../../registry/build-server.ts';

let workspace: Workspace;
let app: TestRuntime;
let payments: string;
let clone: string;

beforeAll(async () => {
  workspace = createWorkspace({ repos: ['payments-go', 'orders-java'] });
  payments = workspace.repoPath('payments-go');
  git(payments, ['switch', '-q', '-c', 'develop']);
  appendFileSync(join(payments, 'main.go'), '\n// RetryBudgetExceeded is only on develop.\n');
  commitAll(payments, 'feat: retry budget');
  git(payments, ['switch', '-q', 'main']);
  /* Clones, like a freshly cloned work repo: only main is local, develop is a fetched origin/develop. */
  clone = join(workspace.root, 'shop', 'payments-clone');
  git(workspace.root, ['clone', '-q', `file://${payments}`, clone]);
  const twice = join(workspace.root, 'shop', 'payments-twice');
  git(workspace.root, ['clone', '-q', `file://${payments}`, twice]);
  git(twice, ['remote', 'add', 'upstream', `file://${payments}`]);
  git(twice, ['fetch', '-q', 'upstream']);
  app = await startTestRuntime(workspace, {
    overrides: { branchSwitchEnv: 'payments-go,payments-clone,payments-twice' },
  });
});

afterAll(async () => {
  await app.close();
  workspace.cleanup();
});

async function listTools(runtime: TestRuntime) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = buildMcpServer(runtime.runtime.context, '0.0.0-test');
  await server.connect(serverSide);
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(clientSide);
  const { tools } = await client.listTools();
  const instructions = client.getInstructions() ?? '';
  await client.close();
  return { tools, instructions };
}

describe('switch_branch', () => {
  test('is listed only when allowed, and says it is not read-only', async () => {
    const { tools, instructions } = await listTools(app);
    const tool = tools.find((candidate) => candidate.name === 'switch_branch');
    expect(tool?.annotations?.readOnlyHint).toBe(false);
    expect(tool?.annotations?.destructiveHint).toBe(false);
    expect(instructions).toContain('except the checked-out branch');
    expect(instructions).toContain('allowed for payments-go');
    const off = createWorkspace({ repos: ['payments-go'] });
    const plain = await startTestRuntime(off, { index: false });
    const offList = await listTools(plain);
    expect(offList.tools.map((candidate) => candidate.name)).not.toContain('switch_branch');
    expect(offList.tools).toHaveLength(9);
    expect(offList.instructions).toContain('Nothing can be changed through these tools.');
    await plain.close();
    off.cleanup();
  });

  test('lists the local branches with the current one marked', async () => {
    const { text, isError } = await app.call('switch_branch', { repo: 'payments-go' });
    expect(isError).toBe(false);
    expect(text).toStartWith('payments-go: on main, 2 local branches.');
    expect(text).toContain('* main');
    expect(text).toContain('  develop');
  });

  test('switches, logs it, and the index follows the new branch', async () => {
    const { text } = await app.call('switch_branch', { repo: 'payments-go', branch: 'develop' });
    expect(text).toStartWith('payments-go switched from main to develop.');
    expect(git(payments, ['branch', '--show-current']).trim()).toBe('develop');
    expect(app.logs.some((line) => line.includes('branch switched'))).toBe(true);
    await app.runtime.coordinator.idle();
    const found = await app.call('search_code', { query: 'RetryBudgetExceeded' });
    expect(found.text).toContain('payments-go/main.go');
    expect((await app.call('switch_branch', { repo: 'payments-go', branch: 'develop' })).text).toBe(
      'payments-go is already on develop.',
    );
    await app.call('switch_branch', { repo: 'payments-go', branch: 'main' });
  });

  test('refuses a repo it is not allowed for, an unknown branch and a bad name', async () => {
    const orders = await app.call('switch_branch', { repo: 'orders-java', branch: 'main' });
    expect(orders.isError).toBe(true);
    expect(orders.text).toContain('not allowed for orders-java');
    const missing = await app.call('switch_branch', { repo: 'payments-go', branch: 'release/9' });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('Branch "release/9" is not on this machine');
    expect(missing.text).toContain('the owner runs git fetch first');
    const option = await app.call('switch_branch', { repo: 'payments-go', branch: '--force' });
    expect(option.text).toContain('not a valid branch name');
    expect(git(payments, ['branch', '--show-current']).trim()).toBe('main');
  });

  test('refuses while there are uncommitted changes, which stay untouched', async () => {
    const main = join(payments, 'main.go');
    const before = readFileSync(main, 'utf8');
    writeFileSync(main, `${before}// work in progress\n`);
    const refused = await app.call('switch_branch', { repo: 'payments-go', branch: 'develop' });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('uncommitted changes in 1 file(s)');
    const listed = await app.call('switch_branch', { repo: 'payments-go' });
    expect(listed.text).toContain('uncommitted changes in 1 file (switching is refused');
    expect(readFileSync(main, 'utf8')).toEndWith('// work in progress\n');
    expect(git(payments, ['branch', '--show-current']).trim()).toBe('main');
    writeFileSync(main, before);
  });

  test('a fetched remote branch is listed, and switching creates its local branch', async () => {
    const listed = await app.call('switch_branch', { repo: 'payments-clone' });
    expect(listed.text).toStartWith('payments-clone: on main, 1 local branch.');
    expect(listed.text).toContain('Fetched remote branches (1)');
    expect(listed.text).toMatch(/ {2}origin\/develop \(last commit \d{4}-\d{2}-\d{2}\)/);
    expect(listed.text).not.toContain('origin/main');
    expect(listed.text).not.toContain('origin/HEAD');
    const { text } = await app.call('switch_branch', { repo: 'payments-clone', branch: 'develop' });
    expect(text).toStartWith('payments-clone switched from main to develop.');
    expect(text).toContain('develop was created from origin/develop, the copy fetched earlier');
    expect(text).toContain('Nothing was downloaded');
    expect(git(clone, ['branch', '--show-current']).trim()).toBe('develop');
    expect(app.logs.some((line) => line.includes('origin/develop'))).toBe(true);
    const back = await app.call('switch_branch', { repo: 'payments-clone', branch: 'origin/main' });
    expect(back.text).toBe(
      'payments-clone switched from develop to main.\nEvery tool now reads this branch. The index catches up in the background; until then a search may miss lines that only this branch has.',
    );
  });

  test('a branch fetched from two remotes has to be named with its remote', async () => {
    const both = await app.call('switch_branch', { repo: 'payments-twice', branch: 'develop' });
    expect(both.isError).toBe(true);
    expect(both.text).toContain('fetched from several remotes: origin/develop, upstream/develop');
    const named = await app.call('switch_branch', {
      repo: 'payments-twice',
      branch: 'upstream/develop',
    });
    expect(named.text).toContain('develop was created from upstream/develop');
  });

  test('a folder that is not a git repo is refused', async () => {
    const folder = createWorkspace({ repos: ['payments-go'], git: false });
    const loose = await startTestRuntime(folder, {
      index: false,
      config: { roots: [], repos: [{ name: 'payments-go', path: folder.repoPath('payments-go') }] },
      overrides: { branchSwitchEnv: 'all' },
    });
    const result = await loose.call('switch_branch', { repo: 'payments-go' });
    expect(result.text).toContain('is not a git repository');
    await loose.close();
    folder.cleanup();
  });
});
