/** Tests for the Go goroutine dump parser. */
import { describe, expect, test } from 'bun:test';
import { goStackParser } from '../stack.ts';

const NIL_PANIC = `2024/05/01 12:00:00 starting order service on :8080
panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x1 addr=0x0 pc=0x4a2b3c]

goroutine 1 [running]:
github.com/acme/orders/internal/service.(*OrderService).Cancel(0x0, {0x5c1e20, 0xc000012345}, 0x2a)
	/app/internal/service/order.go:87 +0x1d
github.com/acme/orders/internal/http.(*Handler).cancelOrder(0xc0000a2000, {0x5c3f40, 0xc0000b4000}, 0xc0000b2000)
	/app/internal/http/handler.go:41 +0x8b
net/http.HandlerFunc.ServeHTTP(0xc000010000?, {0x5c3f40?, 0xc0000b4000?}, 0x0?)
	/usr/local/go/src/net/http/server.go:2136 +0x29
created by net/http.(*Server).Serve in goroutine 1
	/usr/local/go/src/net/http/server.go:3086 +0x5cb
exit status 2
`;

describe('goStackParser', () => {
  test('reads a panic: its message and its frames, innermost first', () => {
    const trace = goStackParser(NIL_PANIC);
    expect(trace?.runtime).toBe('go');
    expect(trace?.messages).toEqual([
      'panic: runtime error: invalid memory address or nil pointer dereference',
    ]);
    expect(trace?.frames.map((frame) => `${frame.func} ${frame.file}:${frame.line}`)).toEqual([
      'github.com/acme/orders/internal/service.(*OrderService).Cancel /app/internal/service/order.go:87',
      'github.com/acme/orders/internal/http.(*Handler).cancelOrder /app/internal/http/handler.go:41',
      'net/http.HandlerFunc.ServeHTTP /usr/local/go/src/net/http/server.go:2136',
      'net/http.(*Server).Serve /usr/local/go/src/net/http/server.go:3086',
    ]);
  });

  test('keeps both printed lines as the raw frame and the path as the hint', () => {
    const [frame] = goStackParser(NIL_PANIC)?.frames ?? [];
    expect(frame).toEqual({
      raw: 'github.com/acme/orders/internal/service.(*OrderService).Cancel(0x0, {0x5c1e20, 0xc000012345}, 0x2a)\n/app/internal/service/order.go:87 +0x1d',
      file: '/app/internal/service/order.go',
      line: 87,
      func: 'github.com/acme/orders/internal/service.(*OrderService).Cancel',
      pathHint: '/app/internal/service/order.go',
    });
  });

  test('lists every panic of a re-panic, outermost first', () => {
    const text = `panic: order 42 not found [recovered]
	panic: order 42 not found

goroutine 7 [running]:
main.mustLoad({0x4b8f2e, 0x2})
	/app/main.go:21 +0x65
`;
    expect(goStackParser(text)?.messages).toEqual([
      'panic: order 42 not found [recovered]',
      'panic: order 42 not found',
    ]);
  });

  test('takes the logged error line before a runtime/debug.Stack() dump, with Windows paths', () => {
    const text = `2024/05/01 12:00:00 http: panic serving 10.0.0.1:51234: index out of range [5] with length 3
goroutine 34 [running]:
runtime/debug.Stack()
	C:/Program Files/Go/src/runtime/debug/stack.go:24 +0x5e
main.handler.func1(...)
	C:\\Users\\dev\\orders\\main.go:12 +0x25
`;
    const trace = goStackParser(text);
    expect(trace?.messages).toEqual([
      '2024/05/01 12:00:00 http: panic serving 10.0.0.1:51234: index out of range [5] with length 3',
    ]);
    expect(trace?.frames.map((frame) => frame.pathHint)).toEqual([
      'C:/Program Files/Go/src/runtime/debug/stack.go',
      'C:/Users/dev/orders/main.go',
    ]);
  });

  test('reads a fatal error, and frames pasted without any header', () => {
    const fatal =
      'fatal error: concurrent map writes\n\ngoroutine 9 [running]:\nmain.save(...)\n\t/app/store.go:14\n';
    expect(goStackParser(fatal)?.messages).toEqual(['fatal error: concurrent map writes']);
    const headless = 'main.save(...)\n\t/app/store.go:14 +0x1f\n';
    expect(goStackParser(headless)?.messages).toEqual([]);
  });

  test('returns null for text without Go frames, such as JVM or .NET traces', () => {
    expect(goStackParser('panic: but no goroutine dump')).toBeNull();
    const jvm =
      'java.lang.IllegalStateException: boom\n\tat com.acme.Order.cancel(Order.java:12)\n';
    expect(goStackParser(jvm)).toBeNull();
    const dotnet = 'System.Exception: boom\n   at Acme.Order.Cancel() in /src/Order.cs:line 12\n';
    expect(goStackParser(dotnet)).toBeNull();
  });
});
