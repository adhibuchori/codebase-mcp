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

describe('find_symbol definitions', () => {
  test('exact case first, with kind, Class.method, range and signature', async () => {
    const { text } = await app.call('find_symbol', { name: 'Refund' });
    expect(text.split('\n').slice(0, 3)).toEqual([
      '"Refund": 3 definitions',
      'method Refund — payments-go/internal/payment/handler.go:23-31',
      '    func (h *Handler) Refund(c *gin.Context)',
    ]);
    expect(text).toContain(
      'method PaymentClient.refund — orders-java/src/main/java/com/acme/orders/client/PaymentClient.java:9-10',
    );
    expect(text).toContain('Read one: read_code "payments-go/internal/payment/handler.go#Refund".');
  });

  test('prefix match filtered by kind and repo, and a limit', async () => {
    const classes = await app.call('find_symbol', {
      name: 'OrderSer',
      kind: 'class',
      repos: ['orders-java'],
    });
    expect(classes.text).toContain(
      'class OrderService — orders-java/src/main/java/com/acme/orders/service/OrderService.java:9-36',
    );
    expect(classes.text).not.toContain('method');
    expect((await app.call('find_symbol', { name: 'Order', limit: 1 })).text).toContain(
      '(limit reached)',
    );
  });

  test('the code that runs comes before the contract that declares the same name', async () => {
    const { text } = await app.call('find_symbol', { name: 'OrderService' });
    expect(text.split('\n')[1]).toBe(
      'class OrderService — orders-java/src/main/java/com/acme/orders/service/OrderService.java:9-36',
    );
    expect(text).toContain('interface OrderService — contracts-proto/orders.proto:5-9');
  });

  test('nothing found suggests a next step', async () => {
    expect((await app.call('find_symbol', { name: 'zzzq' })).text).toContain(
      'Try a shorter part of the name',
    );
  });

  test('repos still indexing are named, not silently skipped', async () => {
    const fresh = createWorkspace({ repos: ['payments-go'] });
    const cold = await startTestRuntime(fresh, { index: false });
    const { text } = await cold.call('find_symbol', { name: 'Refund' });
    expect(text).toContain(
      'Not indexed yet (skipped): payments-go. search_code covers them meanwhile.',
    );
    await cold.close();
    fresh.cleanup();
  });

  test('shards left by an earlier run are ignored while the index is off', async () => {
    const off = await startTestRuntime(workspace, {
      index: false,
      config: { index: { enabled: false, dir: `${workspace.dir}/index` } },
    });
    expect((await off.call('find_symbol', { name: 'Refund' })).text).toContain(
      'Not indexed yet (skipped)',
    );
    await off.close();
  });
});

describe('find_symbol references', () => {
  test('whole-word uses without the definition itself', async () => {
    const { text } = await app.call('find_symbol', { name: 'cancelOrder', mode: 'references' });
    expect(text).toStartWith('References to "cancelOrder": 2 uses in 1 file');
    expect(text).toContain('gateway-node/src/server.ts\n  2: import { cancelOrder, getOrder }');
    expect(text).not.toContain('orders-client.ts');
  });

  test('the busiest file first, folded after three uses, capped by limit', async () => {
    const { text } = await app.call('find_symbol', {
      name: 'order',
      mode: 'references',
      repos: ['orders-java'],
      limit: 1,
    });
    expect(text).toStartWith(
      'References to "order": 6 uses in 2 files · showing 1\norders-java/src/main/java/com/acme/orders/service/OrderService.java',
    );
    expect(text).toContain('  … 2 more');
  });
});
