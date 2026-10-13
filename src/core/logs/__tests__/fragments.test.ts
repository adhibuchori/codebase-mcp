import { describe, expect, test } from 'bun:test';
import { errorChain, literalFragments, messageOf, stripLogPrefix } from '../fragments.ts';

describe('messageOf', () => {
  test('reads the message field of JSON logs', () => {
    expect(messageOf('{"level":"error","msg":"refund failed for payment p-1"}')).toBe(
      'refund failed for payment p-1',
    );
    expect(messageOf('{"message":"a","msg":"b"}')).toBe('a');
  });

  test('reads logfmt msg', () => {
    expect(messageOf('level=error msg="refund failed" payment=p1')).toBe('refund failed');
  });

  test('falls back to the line for anything else', () => {
    expect(messageOf('{not json')).toBe('{not json');
    expect(messageOf('{"count": 3}')).toBe('{"count": 3}');
    expect(messageOf('[1,2]')).toBe('[1,2]');
    expect(messageOf('null')).toBe('null');
    expect(messageOf(' plain text ')).toBe('plain text');
  });
});

test('stripLogPrefix removes timestamps, levels, threads, loggers and exception classes', () => {
  expect(
    stripLogPrefix('2026-10-13T08:15:30.123Z ERROR [main] c.a.o.OrderService - Order 42 cancelled'),
  ).toBe('Order 42 cancelled');
  expect(stripLogPrefix('java.lang.IllegalStateException: Order already cancelled')).toBe(
    'Order already cancelled',
  );
  expect(stripLogPrefix('WARN 12:00:01 Payment declined')).toBe('Payment declined');
  expect(stripLogPrefix('ERROR app.consumer Failed to send notification for order 991')).toBe(
    'Failed to send notification for order 991',
  );
  expect(
    stripLogPrefix(
      '2026-10-13 08:15:30.123 ERROR 1234 --- [nio-8080-exec-1] c.a.o.OrderService : Order failed',
    ),
  ).toBe('Order failed');
  expect(stripLogPrefix('ERROR Failed to start')).toBe('Failed to start');
});

describe('literalFragments', () => {
  test('masks values and keeps the constant text, longest first', () => {
    const line =
      '2026-10-13 08:15:30 WARN [http-1] OrderService: Order 9f8e7d6c-1234-4abc-9def-0123456789ab cancelled after payment "p-77" was refunded';
    expect(literalFragments(line)).toEqual(['cancelled after payment', 'was refunded', 'Order']);
  });

  test('ignores fragments without letters or too short', () => {
    expect(literalFragments('id=123 at 10.0.0.1:8080 -- ok', 4)).toEqual([]);
  });

  test('masks URLs, e-mails and long hex ids', () => {
    expect(
      literalFragments(
        'Upstream timeout for https://orders:8081/api/orders/1 user a@b.co trace deadbeefcafe1234',
      ),
    ).toEqual(['Upstream timeout for', 'trace', 'user']);
  });
});

test('errorChain splits wrapped Go errors', () => {
  expect(errorChain('refund payment p-1: payment already refunded')).toEqual([
    'refund payment p-1',
    'payment already refunded',
  ]);
  expect(errorChain('single message')).toEqual([]);
});
