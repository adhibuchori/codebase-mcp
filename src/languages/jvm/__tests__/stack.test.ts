/** Tests for the JVM stack trace parser. */
import { describe, expect, test } from 'bun:test';
import { jvmStackParser } from '../stack.ts';

const SPRING_TRACE = `2024-05-01 12:00:00.123 ERROR 1 --- [nio-8080-exec-1] o.a.c.c.C.[.[.[/].[dispatcherServlet]    : Servlet.service() for servlet [dispatcherServlet] threw exception
org.springframework.web.util.NestedServletException: Request processing failed; nested exception is java.lang.IllegalStateException: Order 42 is already cancelled
	at org.springframework.web.servlet.FrameworkServlet.processRequest(FrameworkServlet.java:1014) ~[spring-webmvc-5.3.20.jar:5.3.20]
	at org.springframework.web.servlet.FrameworkServlet.doPost(FrameworkServlet.java:909) ~[spring-webmvc-5.3.20.jar:5.3.20]
	at java.base/java.lang.Thread.run(Thread.java:833) ~[na:na]
Caused by: java.lang.IllegalStateException: Order 42 is already cancelled
	at com.acme.orders.OrderService$Cancellation.apply(OrderService.java:87) ~[classes/:na]
	at app//com.acme.orders.OrderController.cancel(OrderController.java:41) ~[classes/:na]
	at java.base@17.0.2/jdk.internal.reflect.NativeMethodAccessorImpl.invoke0(Native Method) ~[na:na]
	at com.acme.orders.OrderRulesKt.requireOpen(OrderRules.kt:12) ~[classes/:na]
	... 48 common frames omitted
`;

describe('jvmStackParser on a chained exception', () => {
  const trace = jvmStackParser(SPRING_TRACE);

  test('lists the messages outermost first, without the "Caused by: " prefix', () => {
    expect(trace?.runtime).toBe('jvm');
    expect(trace?.messages).toEqual([
      'org.springframework.web.util.NestedServletException: Request processing failed; nested exception is java.lang.IllegalStateException: Order 42 is already cancelled',
      'java.lang.IllegalStateException: Order 42 is already cancelled',
    ]);
  });

  test("puts the root cause's frames first, then the outer exception's", () => {
    expect(trace?.frames.map((frame) => frame.func)).toEqual([
      'com.acme.orders.OrderService$Cancellation.apply',
      'com.acme.orders.OrderController.cancel',
      'jdk.internal.reflect.NativeMethodAccessorImpl.invoke0',
      'com.acme.orders.OrderRulesKt.requireOpen',
      'org.springframework.web.servlet.FrameworkServlet.processRequest',
      'org.springframework.web.servlet.FrameworkServlet.doPost',
      'java.lang.Thread.run',
    ]);
  });

  test('builds the path hint from the package and the printed file, without module prefixes', () => {
    expect(trace?.frames[0]).toEqual({
      raw: 'at com.acme.orders.OrderService$Cancellation.apply(OrderService.java:87) ~[classes/:na]',
      file: 'OrderService.java',
      line: 87,
      func: 'com.acme.orders.OrderService$Cancellation.apply',
      pathHint: 'com/acme/orders/OrderService.java',
    });
    expect(trace?.frames.map((frame) => frame.pathHint)).toEqual([
      'com/acme/orders/OrderService.java',
      'com/acme/orders/OrderController.java',
      '',
      'com/acme/orders/OrderRules.kt',
      'org/springframework/web/servlet/FrameworkServlet.java',
      'org/springframework/web/servlet/FrameworkServlet.java',
      'java/lang/Thread.java',
    ]);
  });

  test('gives frames without a source an empty file and line 0', () => {
    expect(trace?.frames[2]).toMatchObject({ file: '', line: 0 });
  });
});

describe('jvmStackParser on other shapes', () => {
  test('orders a three-level chain root first and keeps suppressed exceptions last', () => {
    const text = `Exception in thread "main" java.lang.RuntimeException: Import failed
	at com.acme.batch.Importer.run(Importer.java:30)
	Suppressed: java.io.IOException: close failed
		at com.acme.batch.CsvReader.close(CsvReader.java:77)
		Caused by: java.io.EOFException: truncated
			at com.acme.batch.CsvReader.flush(CsvReader.java:91)
Caused by: com.acme.batch.ParseException: Bad row 12
	at com.acme.batch.RowParser.parse(RowParser.java:55)
	... 1 more
Caused by: java.lang.NumberFormatException: For input string: "x1"
	at java.base/java.lang.Integer.parseInt(Integer.java:652)
	at com.acme.batch.RowParser.amount(RowParser.java:70)
	... 2 more
`;
    const trace = jvmStackParser(text);
    expect(trace?.messages).toEqual([
      'java.lang.RuntimeException: Import failed',
      'com.acme.batch.ParseException: Bad row 12',
      'java.lang.NumberFormatException: For input string: "x1"',
      'java.io.IOException: close failed',
      'java.io.EOFException: truncated',
    ]);
    expect(trace?.frames.map((frame) => `${frame.file}:${frame.line}`)).toEqual([
      'Integer.java:652',
      'RowParser.java:70',
      'RowParser.java:55',
      'Importer.java:30',
      'CsvReader.java:77',
      'CsvReader.java:91',
    ]);
  });

  test('keeps two pasted traces apart and takes a multi-line message by its first line', () => {
    const text = `java.lang.IllegalArgumentException: Invalid order:
  status=CANCELLED
	at com.acme.orders.Validator.check(Validator.java:12)
kotlin.KotlinNullPointerException
	at com.acme.cart.Cart.total(Cart.kt:8)
	at Main.main(Main.java)
	at com.acme.Proxy$$EnhancerBySpringCGLIB$$1.call(<generated>)
	at jdk.proxy2.$Proxy81.find(Unknown Source)
`;
    const trace = jvmStackParser(text);
    expect(trace?.messages).toEqual([
      'java.lang.IllegalArgumentException: Invalid order:',
      'kotlin.KotlinNullPointerException',
    ]);
    expect(trace?.frames.map((frame) => [frame.pathHint, frame.line])).toEqual([
      ['com/acme/orders/Validator.java', 12],
      ['com/acme/cart/Cart.kt', 8],
      ['Main.java', 0],
      ['', 0],
      ['', 0],
    ]);
  });

  test('reads a cause that starts the paste, and frames with no header at all', () => {
    const causeFirst = jvmStackParser(
      'Caused by: java.net.SocketTimeoutException: Read timed out\n\tat java.base/java.net.SocketInputStream.read(SocketInputStream.java:168)\n',
    );
    expect(causeFirst?.messages).toEqual(['java.net.SocketTimeoutException: Read timed out']);
    const bare = jvmStackParser('ERROR something went wrong\n\tat com.acme.Job.run(Job.java:5)\n');
    expect(bare?.messages).toEqual([]);
    expect(bare?.frames).toHaveLength(1);
  });

  test('reads a trace copied out of a JSON log with escaped newlines', () => {
    const json =
      '{"level":"ERROR","stack_trace":"java.lang.IllegalStateException: boom\\n\\tat com.acme.orders.OrderService.cancel(OrderService.java:87)\\n"}';
    const trace = jvmStackParser(json);
    expect(trace?.frames.map((frame) => frame.pathHint)).toEqual([
      'com/acme/orders/OrderService.java',
    ]);
  });

  test('returns null for text without JVM frames, such as .NET or Node.js traces', () => {
    expect(jvmStackParser('Order 42 could not be cancelled')).toBeNull();
    const dotnet =
      'System.InvalidOperationException: boom\n   at Acme.Orders.Order.Cancel(String reason) in /src/Order.cs:line 42\n   at Acme.Orders.Program.Main()\n';
    expect(jvmStackParser(dotnet)).toBeNull();
    const node = 'TypeError: x is undefined\n    at Object.<anonymous> (/app/index.js:10:5)\n';
    expect(jvmStackParser(node)).toBeNull();
  });
});
