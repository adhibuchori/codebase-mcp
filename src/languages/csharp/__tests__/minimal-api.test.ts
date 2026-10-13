/** Tests for ASP.NET Core minimal API endpoints and route groups. */
import { describe, expect, test } from 'bun:test';
import { minimalApiRoutes } from '../minimal-api.ts';

describe('minimalApiRoutes', () => {
  test('resolves route groups per variable, nested groups included', () => {
    const program = `var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/health", () => Results.Ok());

var api = app.MapGroup("/api");
var orders = api.MapGroup("orders").RequireAuthorization();
orders.MapGet("/{id:guid}", async (Guid id, IOrderService service) => await service.GetAsync(id));
orders.MapPost("/", CreateOrder);
orders.MapPut("/{id:guid}", UpdateOrder);
orders.MapDelete("/{id:guid}", DeleteOrder);
orders.MapPatch("/{id:guid}/status", PatchStatus);
orders.MapMethods("/{id:guid}/sync", new[] { "GET", "HEAD" }, Sync);

app.Run();
`;
    expect(
      minimalApiRoutes(program).map((r) => `${r.line} ${r.method} ${r.pattern} ${r.framework}`),
    ).toEqual([
      '4 GET /health aspnet-minimal',
      '8 GET /api/orders/{id:guid} aspnet-minimal',
      '9 POST /api/orders aspnet-minimal',
      '10 PUT /api/orders/{id:guid} aspnet-minimal',
      '11 DELETE /api/orders/{id:guid} aspnet-minimal',
      '12 PATCH /api/orders/{id:guid}/status aspnet-minimal',
      '13 ANY /api/orders/{id:guid}/sync aspnet-minimal',
    ]);
  });

  test('finds nothing in code without endpoint mappings', () => {
    expect(minimalApiRoutes('builder.Services.AddControllers();\napp.MapControllers();\n')).toEqual(
      [],
    );
  });
});
