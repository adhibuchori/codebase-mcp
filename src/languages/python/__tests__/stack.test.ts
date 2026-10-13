/** Python tracebacks: frames reversed to innermost first, chained exceptions root cause first. */
import { describe, expect, test } from 'bun:test';
import { pythonStackParser } from '../stack.ts';

const frames = (text: string): string[] =>
  (pythonStackParser(text)?.frames ?? []).map(
    (frame) => `${frame.func} @ ${frame.pathHint}:${frame.line}`,
  );

describe('single traceback', () => {
  const traceback = `ERROR:orders.api:Unhandled error while cancelling order 42
Traceback (most recent call last):
  File "/app/orders/api.py", line 57, in cancel_order
    order = service.cancel(order_id, reason=payload.reason)
  File "/app/orders/service.py", line 112, in cancel
    self._refund(order)
    ^^^^^^^^^^^^^^^^^^^
  File "/usr/local/lib/python3.12/site-packages/httpx/_client.py", line 1054, in post
    return self.request("POST", url)
orders.errors.RefundFailed: refund for order 42 was declined`;

  test('lists frames innermost first with the message', () => {
    expect(frames(traceback)).toEqual([
      'post @ /usr/local/lib/python3.12/site-packages/httpx/_client.py:1054',
      'cancel @ /app/orders/service.py:112',
      'cancel_order @ /app/orders/api.py:57',
    ]);
    expect(pythonStackParser(traceback)).toMatchObject({
      runtime: 'python',
      messages: ['orders.errors.RefundFailed: refund for order 42 was declined'],
    });
  });

  test('keeps the printed file and a forward-slash hint', () => {
    const windows =
      'Traceback (most recent call last):\n  File "C:\\app\\worker.py", line 9, in <module>\n    main()\nKeyError: \'id\'';
    expect(pythonStackParser(windows)?.frames).toEqual([
      {
        raw: 'File "C:\\app\\worker.py", line 9, in <module>',
        file: 'C:\\app\\worker.py',
        line: 9,
        func: '<module>',
        pathHint: 'C:/app/worker.py',
      },
    ]);
  });
});

describe('chained exceptions', () => {
  test('puts the root cause first in frames and last in messages', () => {
    const chained = `Traceback (most recent call last):
  File "/app/db/pool.py", line 21, in connect
    return psycopg.connect(DSN)
psycopg.OperationalError: connection refused

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "/app/orders/views.py", line 30, in get
    return repo.get(order_id)
  File "/app/orders/repo.py", line 14, in get
    raise RepositoryError("database unavailable") from exc
orders.repo.RepositoryError: database unavailable

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/app/orders/middleware.py", line 8, in __call__
    return self.handle(request)
django.http.Http404: Order 42 not found`;
    expect(pythonStackParser(chained)?.messages).toEqual([
      'django.http.Http404: Order 42 not found',
      'orders.repo.RepositoryError: database unavailable',
      'psycopg.OperationalError: connection refused',
    ]);
    expect(frames(chained)).toEqual([
      'connect @ /app/db/pool.py:21',
      'get @ /app/orders/repo.py:14',
      'get @ /app/orders/views.py:30',
      '__call__ @ /app/orders/middleware.py:8',
    ]);
  });

  test('starts a new traceback when frames follow a finished one without a header', () => {
    const pasted = `  File "/app/a.py", line 1, in f
ValueError: first
  File "/app/b.py", line 2, in g
TypeError: second`;
    expect(pythonStackParser(pasted)?.messages).toEqual(['TypeError: second', 'ValueError: first']);
    expect(frames(pasted)).toEqual(['f @ /app/a.py:1', 'g @ /app/b.py:2']);
  });
});

describe('other input', () => {
  test('reads a traceback escaped inside a JSON log line', () => {
    const logged = String.raw`{"exc_info": "Traceback (most recent call last):\n  File \"/app/tasks.py\", line 5, in sync\n    run()\nRuntimeError: boom"}`;
    expect(frames(logged)).toEqual(['sync @ /app/tasks.py:5']);
  });

  test('a frame without a function still counts', () => {
    expect(frames('  File "/app/settings.py", line 3')).toEqual([' @ /app/settings.py:3']);
  });

  test('returns null without Python frames', () => {
    expect(pythonStackParser('Error: boom\n    at handler (/app/x.js:1:2)')).toBeNull();
    expect(pythonStackParser('Traceback (most recent call last):')).toBeNull();
  });
});
