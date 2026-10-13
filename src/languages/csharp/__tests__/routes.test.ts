/** Tests for the combined C# route extractor. */
import { describe, expect, test } from 'bun:test';
import { aspnetRoutes } from '../routes.ts';

describe('aspnetRoutes', () => {
  test('combines controllers, minimal APIs, calls, topics and gRPC services in line order', () => {
    const program = `var app = WebApplication.CreateBuilder(args).Build();
app.MapGet("/health", () => Results.Ok());
app.MapGrpcService<OrdersService>();
app.Run();

[ApiController]
[Route("api/orders")]
public class OrdersController(HttpClient http, IProducer<string, string> producer) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Create(OrderDto order)
    {
        var stock = await http.GetFromJsonAsync<Stock>($"api/stock/{order.Sku}");
        await producer.ProduceAsync("orders.created", new Message<string, string> { Value = "x" });
        return Accepted();
    }
}

public class OrdersService : Orders.OrdersBase
{
}
`;
    expect(
      aspnetRoutes(program).map(
        (r) => `${r.line} ${r.kind}/${r.role} ${r.method} ${r.pattern} ${r.framework}`,
      ),
    ).toEqual([
      '2 http/handler GET /health aspnet-minimal',
      '10 http/handler POST /api/orders aspnet',
      '13 client/caller GET api/stock/{order.Sku} httpclient',
      '14 topic/producer  orders.created confluent-kafka',
      '19 grpc/handler RPC Orders/* grpc-dotnet',
    ]);
  });

  test('finds nothing in a plain class', () => {
    expect(aspnetRoutes('public record OrderDto(Guid Id, decimal Total);\n')).toEqual([]);
  });
});
