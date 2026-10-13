import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestRuntime, type TestRuntime } from '../../../testing/helpers/test-runtime.ts';
import { createWorkspace, type Workspace } from '../../../testing/helpers/workspace.ts';

let workspace: Workspace;
let app: TestRuntime;
const SERVICE = 'orders-java/src/main/java/com/acme/orders/service/OrderService.java';

beforeAll(async () => {
  workspace = createWorkspace();
  const orders = workspace.repoPath('orders-java');
  const big = Array.from({ length: 260 }, (_, i) => `    static int value${i}() { return ${i}; }`);
  mkdirSync(join(orders, 'src/main/java/com/acme/orders/util'), { recursive: true });
  writeFileSync(
    join(orders, 'src/main/java/com/acme/orders/util/Values.java'),
    ['class Values {', ...big, '}'].join('\n'),
  );
  writeFileSync(
    join(orders, 'notes.txt'),
    Array.from({ length: 250 }, (_, i) => `note ${i}`).join('\n'),
  );
  writeFileSync(join(orders, 'blob.bin'), Buffer.from([1, 0, 2]));
  /* A junction on Windows needs no privilege; elsewhere the type is ignored. */
  symlinkSync(workspace.dir, join(orders, 'escape'), 'junction');
  writeFileSync(join(orders, 'huge.log'), 'x'.repeat(1024 * 1024 + 10));
  app = await startTestRuntime(workspace);
});

afterAll(async () => {
  await app.close();
  workspace.cleanup();
});

describe('read_code', () => {
  test('one symbol by name or Class.method', async () => {
    const { text } = await app.call('read_code', { ref: `${SERVICE}#OrderService.cancel` });
    expect(text).toStartWith(`${SERVICE} · Java · lines 26–35 of 36 · in OrderService.cancel`);
    expect(text).not.toContain('More:');
  });

  test('a line with context, a range, and a whole small file', async () => {
    expect((await app.call('read_code', { ref: `${SERVICE}:29`, context: 2 })).text).toContain(
      'lines 27–31 of 36',
    );
    expect((await app.call('read_code', { ref: `${SERVICE}:1-3` })).text).toContain(
      'More: read_code',
    );
    expect((await app.call('read_code', { ref: 'payments-go/main.go' })).text).toContain(
      'lines 1–21 of 21',
    );
  });

  test('a large file starts with its outline; content and outline can be forced', async () => {
    const big = 'orders-java/src/main/java/com/acme/orders/util/Values.java';
    expect((await app.call('read_code', { ref: big })).text).toContain('outline (261 symbols)');
    expect((await app.call('read_code', { ref: big, mode: 'content' })).text).toContain(
      'More: read_code',
    );
    expect((await app.call('read_code', { ref: 'orders-java/notes.txt' })).text).toContain(
      'lines 1–200 of 250',
    );
    expect(
      (await app.call('read_code', { ref: 'orders-java/notes.txt', mode: 'outline' })).text,
    ).toContain('Read a range: read_code "orders-java/notes.txt:1-200".');
    expect(
      (
        await app.call('read_code', {
          ref: 'payments-go/internal/payment/handler.go',
          mode: 'outline',
        })
      ).text,
    ).toContain('method func (h *Handler) Refund(c *gin.Context)  L23-31');
  });

  test('refuses what it must not read, and says how to fix a bad reference', async () => {
    const cases: [string, string][] = [
      ['orders-java/escape/codebase.config.json', 'leaves the repo'],
      ['orders-java/blob.bin', 'binary'],
      ['orders-java/src', 'not a file'],
      ['orders-java/huge.log', 'larger than the 1024 KB read limit'],
      ['orders-java/missing.java', 'Not found'],
      ['orders-java/.env', 'sensitive'],
      [`${SERVICE}#nothing`, 'No symbol "nothing"'],
      ['orders-java/notes.txt#foo', 'This file has no symbols; read it by line range.'],
      ['orders-java', 'not a code reference'],
    ];
    for (const [ref, message] of cases) {
      const answer = await app.call('read_code', { ref });
      expect(answer.isError).toBe(true);
      expect(answer.text).toContain(message);
    }
  });
});

describe('find_files', () => {
  test('fuzzy path matching across repos', async () => {
    expect((await app.call('find_files', { query: 'order controller' })).text).toContain(
      'orders-java/src/main/java/com/acme/orders/api/OrderController.java',
    );
    expect(
      (await app.call('find_files', { query: 'ordsvc', repos: ['orders-java'] })).text,
    ).toContain('OrderService.java');
    expect((await app.call('find_files', { query: 'service', limit: 1 })).text).toContain(
      'showing the best 1',
    );
    expect((await app.call('find_files', { query: 'zzzz' })).text).toContain(
      'No file path matches',
    );
    expect((await app.call('find_files', { query: 'OrderServiceTest' })).text).toContain('[test]');
  });
});

describe('before the index is ready', () => {
  test('symbols are parsed on demand and file paths come from the file list', async () => {
    const fresh = createWorkspace({ repos: ['orders-java'] });
    const cold = await startTestRuntime(fresh, { index: false });
    expect((await cold.call('read_code', { ref: `${SERVICE}#cancel` })).text).toContain(
      'lines 26–35 of 36 · in OrderService.cancel',
    );
    expect((await cold.call('find_files', { query: 'order controller' })).text).toContain(
      'OrderController.java',
    );
    await cold.close();
    fresh.cleanup();
  });

  test('a tiny budget drops the outline preview first', async () => {
    const tiny = await startTestRuntime(workspace, {
      index: false,
      config: { limits: { maxResponseTokens: 500 } },
    });
    const { text } = await tiny.call('read_code', {
      ref: 'orders-java/src/main/java/com/acme/orders/util/Values.java',
    });
    expect(text).toContain('outline (261 symbols)');
    expect(text).not.toContain('First 30 lines:');
    await tiny.close();
  });
});
