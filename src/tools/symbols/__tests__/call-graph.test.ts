import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { addGraphFiles } from '../../../testing/helpers/graph-files.ts';
import { startTestRuntime, type TestRuntime } from '../../../testing/helpers/test-runtime.ts';
import { createWorkspace, type Workspace } from '../../../testing/helpers/workspace.ts';

let workspace: Workspace;
let app: TestRuntime;
const JAVA = 'orders-java/src/main/java/com/acme/orders';

beforeAll(async () => {
  workspace = createWorkspace();
  addGraphFiles(workspace);
  app = await startTestRuntime(workspace);
});

afterAll(async () => {
  await app.close();
  workspace.cleanup();
});

const graph = async (name: string, mode: string, extra: Record<string, unknown> = {}) =>
  (await app.call('find_symbol', { name, mode, ...extra })).text;

describe('find_symbol callers (Java)', () => {
  test('tells two methods with the same name apart by type', async () => {
    const text = await graph('OrderService.cancel', 'callers');
    expect(text).toContain(
      `exact   ${JAVA}/api/OrderController.java:23 · in OrderController.cancel · service.cancel`,
    );
    expect(text).toContain('Callers of OrderService.cancel');
    expect(await graph('OrderController.cancel', 'callers')).toContain('none found');
  });

  test('a call through an interface, a wildcard import and an unknown receiver', async () => {
    const lines = (await graph('CardRefunds.refund', 'callers')).split('\n');
    expect(lines[0]).toBe(
      `Callers of CardRefunds.refund (${JAVA}/billing/CardRefunds.java:4-6): 1 exact, 1 likely, 1 name`,
    );
    expect(lines[1]).toBe(
      `  exact   ${JAVA}/jobs/Settlement.java:9 · in Settlement.settle · refunds.refund · via Refunds`,
    );
    expect(lines[2]).toBe(
      `  likely  ${JAVA}/jobs/RefundJob.java:9 · in RefundJob.run · card.refund`,
    );
    expect(lines[3]).toBe(
      `  name    ${JAVA}/jobs/RefundJob.java:11 · in RefundJob.run · handle.refund`,
    );
    expect(lines[4]).toContain('"name" = same name');
  });

  test('an inherited call from a subclass, and the limit', async () => {
    const text = await graph('CardRefunds.audit', 'callers');
    expect(text).toContain(
      `exact   ${JAVA}/billing/QuickRefunds.java:5 · in QuickRefunds.run · audit · via inherited`,
    );
    expect(await graph('CardRefunds.audit', 'callers', { limit: 1 })).toContain(
      '… 1 more (raise limit)',
    );
  });

  test('a name shared by many definitions asks for one; an unknown name says so', async () => {
    const text = await graph('refund', 'callers');
    expect(text).toContain(
      '6 definitions are named "refund". Name the one you mean as Class.method:',
    );
    expect(text).toContain('Example: {"name":"PaymentsApi.refund","mode":"callers"}');
    expect(await graph('nothingLikeThis', 'callers')).toContain(
      'No definition named "nothingLikeThis"',
    );
  });

  test('a language without a graph query matches by name', async () => {
    expect(await graph('Refund', 'callers')).toContain(
      'name    payments-go/internal/payment/handler.go:25 · in Refund · Refund',
    );
  });
});

describe('find_symbol callers (types and other languages)', () => {
  test('constructions of a class, and uses in one file in line order', async () => {
    const text = await graph('PaymentsApi', 'callers');
    expect(text).toContain(
      'exact   ios-app/App/RefundViewModel.swift:6 · in RefundViewModel.submit · new PaymentsApi',
    );
    expect(text).toContain(
      'exact   gateway-node/src/screens/refund-screen.tsx:7 · in RefundScreen · new PaymentsApi',
    );
    const methods = await graph('PaymentsApi.refund', 'callers');
    expect(methods.indexOf('RefundViewModel.kt:7')).toBeLessThan(
      methods.indexOf('RefundViewModel.kt:8'),
    );
  });
});

describe('find_symbol callees', () => {
  test('a call through an interface reaches the interface and its implementation', async () => {
    expect(await graph('Settlement.settle', 'callees')).toContain(
      `9 refunds.refund → exact   Refunds.refund — ${JAVA}/billing/Refunds.java:4 (+1 other)`,
    );
  });

  test('Java: resolved, outside the indexed code, and unresolved', async () => {
    const text = await graph('OrderService.cancel', 'callees');
    expect(text).toContain(
      `31 payments.refund → exact   PaymentClient.refund — ${JAVA}/client/PaymentClient.java:9-10`,
    );
    expect(text).toContain(
      `28 order.isCancelled → exact   Order.isCancelled — ${JAVA}/service/Order.java:4-6`,
    );
    expect(text).toContain('log.warn (org.slf4j.Logger)');
    expect(await graph('RefundJob.run', 'callees')).toContain(
      'Unresolved (receiver type unknown): handle.refund',
    );
    expect(await graph('OrderService.cancel', 'callees', { limit: 1 })).toContain(
      'more (raise limit)',
    );
  });

  test('TSX: a class, a namespace, an alias and a component from another repo', async () => {
    const text = await graph('RefundScreen', 'callees');
    expect(text).toContain(
      '8 client.refund → exact   PaymentsApi.refund — gateway-node/src/api/payments.ts:2-4',
    );
    expect(text).toContain(
      '9 payments.formatAmount → exact   formatAmount — gateway-node/src/api/payments.ts:7-9',
    );
    expect(text).toContain(
      '10 formatAmount → likely  formatAmount — gateway-node/src/api/payments.ts:7-9',
    );
    expect(text).toContain('10 <Badge> → likely  Badge — design-system/src/badge.tsx:1-3');
    expect(await graph('Badge', 'callers')).toContain(
      'likely  gateway-node/src/screens/refund-screen.tsx:10 · in RefundScreen · <Badge>',
    );
  });

  test('Kotlin and Swift: typed properties, self and top-level functions', async () => {
    const kotlin = await graph('RefundViewModel.submit', 'callees');
    expect(kotlin).toContain(
      '8 this.api.refund → likely  PaymentsApi.refund — android-app/app/src/main/java/com/acme/app/PaymentsApi.kt:4',
    );
    expect(kotlin).toContain(
      '9 topLevel → likely  topLevel — android-app/app/src/main/java/com/acme/app/RefundViewModel.kt:13',
    );
    expect(kotlin).toContain(
      '5 self.api.refund → exact   PaymentsApi.refund — ios-app/App/PaymentsApi.swift:2',
    );
    expect(kotlin).toContain(
      '6 new PaymentsApi → exact   PaymentsApi — ios-app/App/PaymentsApi.swift:1-3',
    );
  });
});
