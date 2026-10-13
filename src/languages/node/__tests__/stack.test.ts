/** V8 traces: every frame shape Node prints, cause chains, log prefixes, and what is not a V8 trace. */
import { describe, expect, test } from 'bun:test';
import { nodeStackParser } from '../stack.ts';

const frames = (text: string): string[] =>
  (nodeStackParser(text)?.frames ?? []).map(
    (frame) => `${frame.func} @ ${frame.pathHint}:${frame.line}`,
  );

describe('frames', () => {
  test('reads every frame shape V8 prints, innermost first', () => {
    const trace = `TypeError: Cannot read properties of undefined (reading 'total')
    at OrdersService.applyDiscount (/app/src/orders/orders.service.ts:88:31)
    at async OrdersController.checkout (file:///app/dist/orders/orders.controller.mjs:41:7)
    at new OrderTotals (/app/src/orders/order-totals.ts:12:11)
    at Object.<anonymous> (/app/scripts/recalculate.js:5:1)
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1595:16)
    at /app/node_modules/express/lib/router/layer.js:95:5
    at Module._compile (node:internal/modules/cjs/loader:1256:14)
    at new Promise (<anonymous>)
    at async Promise.all (index 0)
    at Layer.handle [as handle_request] (C:\\build\\api\\node_modules\\express\\lib\\router\\layer.js:95:5)`;
    expect(frames(trace)).toEqual([
      'OrdersService.applyDiscount @ /app/src/orders/orders.service.ts:88',
      'OrdersController.checkout @ /app/dist/orders/orders.controller.mjs:41',
      'new OrderTotals @ /app/src/orders/order-totals.ts:12',
      'Object.<anonymous> @ /app/scripts/recalculate.js:5',
      'TCPConnectWrap.afterConnect [as oncomplete] @ node:net:1595',
      ' @ /app/node_modules/express/lib/router/layer.js:95',
      'Module._compile @ node:internal/modules/cjs/loader:1256',
      'new Promise @ :0',
      'Promise.all @ :0',
      'Layer.handle [as handle_request] @ C:/build/api/node_modules/express/lib/router/layer.js:95',
    ]);
    expect(nodeStackParser(trace)?.frames[1]).toEqual({
      raw: 'at async OrdersController.checkout (file:///app/dist/orders/orders.controller.mjs:41:7)',
      file: '/app/dist/orders/orders.controller.mjs',
      line: 41,
      func: 'OrdersController.checkout',
      pathHint: '/app/dist/orders/orders.controller.mjs',
    });
  });

  test('reads a source-mapped webpack frame', () => {
    expect(frames('Error: boom\n    at render (webpack://storefront/src/cart.tsx:20:9)')).toEqual([
      'render @ src/cart.tsx:20',
    ]);
  });
});

describe('messages', () => {
  test('reads the error line of an uncaught crash, past the source excerpt', () => {
    const crash = `/app/src/server.js:25
        throw new RangeError(\`Invalid order id: \${id}\`);
        ^

RangeError: Invalid order id: abc
    at parseOrderId (/app/src/server.js:25:15)
    at /app/src/server.js:40:3

Node.js v20.11.0`;
    expect(nodeStackParser(crash)).toMatchObject({
      runtime: 'node',
      messages: ['RangeError: Invalid order id: abc'],
    });
  });

  test('finds the error line behind a log prefix and keeps its code', () => {
    const nest = `[Nest] 1  - 05/01/2024, 10:00:00 AM   ERROR [ExceptionsHandler] Cannot set headers
Uncaught Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client
    at ServerResponse.setHeader (node:_http_outgoing:652:11)`;
    expect(nodeStackParser(nest)?.messages).toEqual([
      'Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client',
    ]);
  });

  test('has no message when only frames were pasted', () => {
    expect(nodeStackParser('    at checkout (/app/src/cart.js:3:9)')?.messages).toEqual([]);
  });
});

describe('cause chains', () => {
  test('lists messages outermost first and frames root cause first', () => {
    const chained = `Error: Failed to cancel order 42
    at OrdersService.cancel (/app/src/orders/orders.service.ts:88:13) {
  [cause]: TypeError: fetch failed
      at node:internal/deps/undici/undici:12618:11
      at async PaymentsClient.refund (/app/src/payments/payments.client.ts:14:20) {
    [cause]: Error: connect ECONNREFUSED 127.0.0.1:8080
        at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1595:16) {
      errno: -111,
      code: 'ECONNREFUSED'
    }
  }
}`;
    expect(nodeStackParser(chained)?.messages).toEqual([
      'Error: Failed to cancel order 42',
      'TypeError: fetch failed',
      'Error: connect ECONNREFUSED 127.0.0.1:8080',
    ]);
    expect(frames(chained)).toEqual([
      'TCPConnectWrap.afterConnect [as oncomplete] @ node:net:1595',
      ' @ node:internal/deps/undici/undici:12618',
      'PaymentsClient.refund @ /app/src/payments/payments.client.ts:14',
      'OrdersService.cancel @ /app/src/orders/orders.service.ts:88',
    ]);
  });

  test('reads Caused by chains and a cause printed without a stack', () => {
    const verror = `Error: sync failed
    at syncInventory (/app/jobs/sync.js:10:11)
Caused by: database unavailable
    at Pool.connect (/app/db/pool.js:3:9) {
  [cause]: [Error: getaddrinfo ENOTFOUND db.internal]
}`;
    expect(nodeStackParser(verror)?.messages).toEqual([
      'Error: sync failed',
      'database unavailable',
      'Error: getaddrinfo ENOTFOUND db.internal',
    ]);
    expect(frames(verror)).toEqual([
      'Pool.connect @ /app/db/pool.js:3',
      'syncInventory @ /app/jobs/sync.js:10',
    ]);
  });

  test('drops the brace that opens a cause’s own properties', () => {
    const inspected = `Error: Failed to load order
    at loadOrder (/app/src/orders.js:10:11) {
  [cause]: Error: getaddrinfo ENOTFOUND db.internal {
    code: 'ENOTFOUND'
  }
}`;
    expect(nodeStackParser(inspected)?.messages).toEqual([
      'Error: Failed to load order',
      'Error: getaddrinfo ENOTFOUND db.internal',
    ]);
  });

  test('ignores an empty cause marker', () => {
    expect(
      nodeStackParser('Error: a\n    at f (/a.js:1:1)\n[cause]:\n    at g (/b.js:2:2)')?.messages,
    ).toEqual(['Error: a']);
  });
});

describe('what is not a V8 trace', () => {
  test('reads a trace escaped inside a JSON log line', () => {
    const pino = String.raw`{"level":50,"err":{"type":"Error","stack":"Error: boom\n    at handler (/app/src/x.js:3:9)"}}`;
    expect(frames(pino)).toEqual(['handler @ /app/src/x.js:3']);
  });

  test('returns null for JVM and .NET frames, tracebacks and prose', () => {
    expect(
      nodeStackParser(
        'java.lang.IllegalStateException: x\n\tat com.acme.Orders.cancel(Orders.java:42)',
      ),
    ).toBeNull();
    expect(
      nodeStackParser('   at Acme.Orders.Cancel(Int32 id) in /src/Orders.cs:line 42'),
    ).toBeNull();
    expect(
      nodeStackParser('Traceback (most recent call last):\n  File "/app/x.py", line 3, in f'),
    ).toBeNull();
    expect(nodeStackParser('Deploy finished\n  at least one replica is ready')).toBeNull();
  });
});
