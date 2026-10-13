/** Tests for the .NET exception output parser. */
import { describe, expect, test } from 'bun:test';
import { dotnetStackParser } from '../stack.ts';

const KESTREL_LOG = `fail: Microsoft.AspNetCore.Server.Kestrel[13]
      Connection id "0HMVD9A1", Request id "0HMVD9A1:00000002": An unhandled exception was thrown by the application.
      System.InvalidOperationException: Order 42 cannot be cancelled
       ---> System.ArgumentNullException: Value cannot be null. (Parameter 'customer')
         at Acme.Orders.Domain.Order.Cancel(String reason) in /src/Acme.Orders/Domain/Order.cs:line 42
         at Acme.Orders.Services.OrderService.CancelAsync(Guid id) in /src/Acme.Orders/Services/OrderService.cs:line 87
         --- End of inner exception stack trace ---
         at Acme.Orders.Services.OrderService.CancelAsync(Guid id) in C:\\build\\src\\Acme.Orders\\Services\\OrderService.cs:line 91
         at Acme.Orders.Api.Controllers.OrdersController.Cancel(Guid id) in /src/Acme.Orders.Api/Controllers/OrdersController.cs:line 55
         at lambda_method5(Closure, Object)
      --- End of stack trace from previous location ---
         at Microsoft.AspNetCore.Mvc.Infrastructure.ActionMethodExecutor.TaskOfIActionResultExecutor.Execute(ActionContext actionContext)
`;

describe('dotnetStackParser', () => {
  const trace = dotnetStackParser(KESTREL_LOG);

  test('lists the outer exception, then each inner one', () => {
    expect(trace?.runtime).toBe('dotnet');
    expect(trace?.messages).toEqual([
      'System.InvalidOperationException: Order 42 cannot be cancelled',
      "System.ArgumentNullException: Value cannot be null. (Parameter 'customer')",
    ]);
  });

  test('keeps the printed order, which puts the inner exception (root cause) frames first', () => {
    expect(trace?.frames.map((frame) => `${frame.func}:${frame.line}`)).toEqual([
      'Acme.Orders.Domain.Order.Cancel:42',
      'Acme.Orders.Services.OrderService.CancelAsync:87',
      'Acme.Orders.Services.OrderService.CancelAsync:91',
      'Acme.Orders.Api.Controllers.OrdersController.Cancel:55',
      'lambda_method5:0',
      'Microsoft.AspNetCore.Mvc.Infrastructure.ActionMethodExecutor.TaskOfIActionResultExecutor.Execute:0',
    ]);
  });

  test('keeps the printed file and gives a forward-slash path hint; no file without " in "', () => {
    expect(trace?.frames[2]).toEqual({
      raw: 'at Acme.Orders.Services.OrderService.CancelAsync(Guid id) in C:\\build\\src\\Acme.Orders\\Services\\OrderService.cs:line 91',
      file: 'C:\\build\\src\\Acme.Orders\\Services\\OrderService.cs',
      line: 91,
      func: 'Acme.Orders.Services.OrderService.CancelAsync',
      pathHint: 'C:/build/src/Acme.Orders/Services/OrderService.cs',
    });
    expect(trace?.frames[4]).toMatchObject({ file: '', line: 0, pathHint: '' });
  });

  test('reads unhandled-exception output and aggregate inner exceptions', () => {
    const text = `Unhandled exception. System.AggregateException: One or more errors occurred. (Connection refused)
 ---> (Inner Exception #0) System.Net.Http.HttpRequestException: Connection refused (inventory:80)
   at Acme.Orders.InventoryClient.ReserveAsync(String sku) in /src/Acme.Orders/InventoryClient.cs:line 33<---
`;
    const parsed = dotnetStackParser(text);
    expect(parsed?.messages).toEqual([
      'System.AggregateException: One or more errors occurred. (Connection refused)',
      'System.Net.Http.HttpRequestException: Connection refused (inventory:80)',
    ]);
    expect(parsed?.frames.map((frame) => frame.pathHint)).toEqual([
      '/src/Acme.Orders/InventoryClient.cs',
    ]);
  });

  test('returns null for text without .NET frames, such as JVM or Node.js traces', () => {
    expect(dotnetStackParser('System.InvalidOperationException: no frames here')).toBeNull();
    const jvm = `java.lang.IllegalStateException: boom
	at com.acme.orders.OrderService.cancel(OrderService.java:87)
	at java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
	at jdk.proxy2.$Proxy81.find(Unknown Source)
`;
    expect(dotnetStackParser(jvm)).toBeNull();
    const node = 'TypeError: x is undefined\n    at Object.<anonymous> (/app/index.js:10:5)\n';
    expect(dotnetStackParser(node)).toBeNull();
  });
});
