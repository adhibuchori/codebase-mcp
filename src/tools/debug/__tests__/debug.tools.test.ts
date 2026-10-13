import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestRuntime, type TestRuntime } from '../../../testing/helpers/test-runtime.ts';
import { createWorkspace, type Workspace } from '../../../testing/helpers/workspace.ts';

let workspace: Workspace;
let app: TestRuntime;

const JAVA_TRACE = [
  'java.lang.IllegalStateException: Order already cancelled',
  '\tat com.acme.orders.service.OrderService.cancel(OrderService.java:29)',
  '\tat com.acme.orders.api.OrderController.cancel(OrderController.java:24)',
  '\tat org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:897)',
  '\tat com.acme.legacy.Gone.run(Gone.java:3)',
].join('\n');

const EVENTS = 'src/main/java/com/acme/orders/events';

beforeAll(async () => {
  workspace = createWorkspace();
  const orders = workspace.repoPath('orders-java');
  writeFileSync(
    join(orders, EVENTS, 'AuditListener.java'),
    'package com.acme.orders.events;\n\nclass AuditListener {\n    @KafkaListener(topics = "${env}.orders.audit")\n    void audit(String id) {\n        AuditLog.record("refund audit failed for order", id);\n    }\n\n    @KafkaListener(topics = "${audit.topic}")\n    void any(String id) {}\n}\n',
  );
  mkdirSync(join(orders, 'legacy'), { recursive: true });
  writeFileSync(join(orders, 'legacy/OrderService.java'), 'class OrderService {}\n');
  app = await startTestRuntime(workspace, { config: { logging: { loggerNames: ['AuditLog'] } } });
});

afterAll(async () => {
  await app.close();
  workspace.cleanup();
});

describe('triage_error', () => {
  test('a Java stack trace: application frames with code, library frames counted', async () => {
    const { text } = await app.call('triage_error', { text: JAVA_TRACE });
    expect(text).toContain(
      'Stack trace (jvm): java.lang.IllegalStateException: Order already cancelled',
    );
    expect(text).toContain('Resolved 2 of 3 application frames; 1 library frame skipped.');
    expect(text).toContain(
      '#1 orders-java/src/main/java/com/acme/orders/service/OrderService.java:29 · in OrderService.cancel',
    );
    expect(text).toContain('> 29: throw new IllegalStateException("Order already cancelled");');
    expect(text).toContain('Not in these repos: at com.acme.legacy.Gone.run(Gone.java:3)');
    expect(text).toContain('Where the message is created:');
  });

  test('a frame past the end of the file says the build differs', async () => {
    const trace =
      'Traceback (most recent call last):\n  File "/app/app/main.py", line 99, in notify\n    raise ValueError(name)\nValueError: Unknown template: welcome';
    const { text } = await app.call('triage_error', { text: trace });
    expect(text).toContain(
      '#1 notifications-python/app/main.py:99 · line 99 is past the end of this file',
    );
  });

  test('a log line: masked ids, the log call first, then the error it wraps', async () => {
    const { text } = await app.call('triage_error', {
      text: '2026/10/13 08:15:30 refund failed for payment p-77: refund payment p-77: payment already refunded',
    });
    expect(text).toContain(
      'Fragments searched: "refund failed for payment", "payment already refunded", "refund payment"',
    );
    expect(
      text.indexOf('#1 payments-go/internal/payment/handler.go:26 · in Refund'),
    ).toBeGreaterThan(0);
    expect(text).toContain('payments-go/internal/payment/service.go:21 · in Refund');
    expect((await app.call('triage_error', { text: 'zzzz qqqq' })).text).toContain(
      'No statement found for: "zzzz qqqq".',
    );
  });

  test('a failing URL goes to its handlers and callers; kinds can be forced', async () => {
    const url = await app.call('triage_error', {
      text: 'GET https://shop.example.com/api/orders/42 returned 500',
    });
    expect(url.text).toContain(
      '- orders-java/src/main/java/com/acme/orders/api/OrderController.java:16  GET /api/orders/{id}  (spring, handler)',
    );
    expect(url.text).toContain('(axios, caller)');
    const forced = await app.call('triage_error', { text: 'no frames at all', kind: 'stacktrace' });
    expect(forced.isError).toBe(true);
    expect(forced.text).toContain('No stack frames recognised');
    expect(
      (
        await app.call('triage_error', {
          text: 'Order already cancelled',
          kind: 'log',
          repos: ['orders-java'],
        })
      ).text,
    ).toContain('OrderService.java:29');
  });
});

describe('triage_error beyond the first frames', () => {
  test('frames after the third are listed by reference', async () => {
    const frames = [
      'OrderService.cancel(OrderService.java:29)',
      'OrderController.cancel(OrderController.java:24)',
      'PaymentClient.refund(PaymentClient.java:9)',
      'OrderEvents.cancelled(OrderEvents.java:15)',
    ];
    const { text } = await app.call('triage_error', {
      text: [
        'java.lang.RuntimeException: x',
        ...frames.map((frame) => `\tat com.acme.orders.${frame}`),
      ].join('\n'),
    });
    expect(text).toContain(
      '- orders-java/src/main/java/com/acme/orders/events/OrderEvents.java:15 (com.acme.orders.OrderEvents.cancelled)',
    );
  });

  test('an in-house logger name marks the line as a log statement', async () => {
    const { text } = await app.call('triage_error', {
      text: 'refund audit failed for order 77',
      kind: 'log',
    });
    expect(text).toContain('AuditListener.java:6');
    expect(text).toContain(
      '#1 orders-java/src/main/java/com/acme/orders/events/AuditListener.java:6 · in AuditListener.audit',
    );
  });

  test('before the index is ready, frames resolve from the file list', async () => {
    const fresh = createWorkspace({ repos: ['orders-java'] });
    const cold = await startTestRuntime(fresh, { index: false });
    expect((await cold.call('triage_error', { text: JAVA_TRACE })).text).toContain(
      'Resolved 2 of 3 application frames',
    );
    expect((await cold.call('find_endpoint', { query: '/api/orders/1' })).text).toContain(
      'Not indexed yet: orders-java (search_code covers them).',
    );
    await cold.close();
    fresh.cleanup();
  });

  test('a file deleted since it was indexed loses only its snippet', async () => {
    const fresh = createWorkspace({ repos: ['orders-java'] });
    const indexed = await startTestRuntime(fresh);
    rmSync(
      join(fresh.repoPath('orders-java'), 'src/main/java/com/acme/orders/api/OrderController.java'),
    );
    const { text } = await indexed.call('triage_error', { text: JAVA_TRACE });
    expect(text).toContain('Resolved 2 of 3 application frames');
    expect(text).toContain(
      '#1 orders-java/src/main/java/com/acme/orders/service/OrderService.java:29',
    );
    expect(text).not.toContain('#2 ');
    await indexed.close();
    fresh.cleanup();
  });
});

describe('find_endpoint', () => {
  test('an HTTP call with a concrete id finds the handler and the caller', async () => {
    const { text } = await app.call('find_endpoint', { query: 'POST /api/payments/77/refund' });
    expect(text).toBe(
      [
        'HTTP POST /api/payments/77/refund',
        'Served by:',
        '- payments-go/main.go:16  POST /api/payments/:id/refund  (gin, handler)',
        'Called or produced by:',
        '- orders-java/src/main/java/com/acme/orders/client/PaymentClient.java:9  POST /api/payments/{id}/refund  (feign, caller)',
      ].join('\n'),
    );
  });

  test('topics and gRPC methods', async () => {
    const topic = await app.call('find_endpoint', { query: 'orders.cancelled' });
    expect(topic.text).toContain('(kafka-go, consumer)');
    expect(topic.text).toContain('(spring-kafka, producer)');
    expect((await app.call('find_endpoint', { query: 'OrderService/CancelOrder' })).text).toContain(
      'contracts-proto/orders.proto:7  RPC OrderService/CancelOrder',
    );
    expect((await app.call('find_endpoint', { query: '/api/invoices/9/pay' })).text).toContain(
      'POST /api/Invoices/{id}/pay  (aspnet, handler)',
    );
  });

  test('part of a topic name, and topic names built from placeholders', async () => {
    expect((await app.call('find_endpoint', { query: 'cancelled' })).text).toContain(
      'orders.cancelled  (spring-kafka, producer)',
    );
    const placeholder = await app.call('find_endpoint', { query: 'prod.orders.audit' });
    expect(placeholder.text).toContain('AuditListener.java:4  ${env}.orders.audit');
    expect(placeholder.text).not.toContain('${audit.topic}');
  });

  test('no match gives a search hint', async () => {
    const { text } = await app.call('find_endpoint', { query: '/nothing/here' });
    expect(text).toContain('No handler, consumer or definition matches.');
    expect(text).toContain('Hint: search_code');
  });
});
