/** Tests for ASP.NET Core attribute-routed controllers and Refit clients. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { controllerRoutes } from '../controllers.ts';
import { maskSource } from '../syntax.ts';

const summary = (code: string): string[] =>
  controllerRoutes(maskSource(code)).map(
    (r: RouteDef) => `${r.line} ${r.kind}/${r.role} ${r.method} ${r.pattern} ${r.framework}`,
  );

const ORDERS_CONTROLLER = `using Microsoft.AspNetCore.Mvc;

namespace Acme.Orders.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class OrdersController : ControllerBase
    {
        [HttpGet]
        public async Task<ActionResult<IEnumerable<OrderDto>>> List() => Ok(await _service.ListAsync());

        [HttpGet("{id:guid}", Name = "GetOrder")]
        public async Task<IActionResult> Get(Guid id)
        {
            var order = await _service.GetAsync(id);
            return order is null ? NotFound() : Ok(order);
        }

        // [HttpGet("commented-out")]
        [HttpPost]
        [Route("bulk")]
        public IActionResult Bulk([FromBody] List<OrderDto> orders) { return Ok(); }

        [HttpDelete("~/admin/orders/{id}"), Authorize(Roles = "admin")]
        public IActionResult Delete(Guid id) { return NoContent(); }

        [Route("[action]")]
        public IActionResult Export() { return Ok(); }

        [HttpPatch("/v2/orders/{id}")] public IActionResult Patch(Guid id) => Ok();
    }

    [Route("api/v{version:apiVersion}/payments")]
    public sealed class PaymentsController(IPaymentService service)
        : ControllerBase
    {
        [HttpPut("{id}")]
        public IActionResult Put(int id) => Ok();
    }
}
`;

describe('controllerRoutes', () => {
  test('joins each class prefix to its actions and fills in the route tokens', () => {
    expect(summary(ORDERS_CONTROLLER)).toEqual([
      '9 http/handler GET /api/Orders aspnet',
      '12 http/handler GET /api/Orders/{id:guid} aspnet',
      '20 http/handler POST /api/Orders/bulk aspnet',
      '24 http/handler DELETE /admin/orders/{id} aspnet',
      '27 http/handler ANY /api/Orders/Export aspnet',
      '30 http/handler PATCH /v2/orders/{id} aspnet',
      '37 http/handler PUT /api/v{version:apiVersion}/payments/{id} aspnet',
    ]);
  });

  test('does not carry a prefix past its class, nor attach one to a class without a body', () => {
    const code = `[Route("api/legacy")]
public class Marker(string name);

public class HealthController : ControllerBase {
    [HttpGet("/health")]
    public IActionResult Health() => Ok();
}

[Route("api/[controller]/[action]")]
public class ReportsController : ControllerBase
{
    [HttpGet]
    public IActionResult Daily() => Ok();
}

public class Unrouted : ControllerBase
{
    [HttpGet("ping")]
    public IActionResult Ping() => Ok();
}
`;
    expect(summary(code)).toEqual([
      '5 http/handler GET /health aspnet',
      '12 http/handler GET /api/Reports/Daily aspnet',
      '18 http/handler GET /ping aspnet',
    ]);
  });

  test('reads Refit interface methods as outgoing calls', () => {
    const refit = `public interface IGitHubApi
{
    [Get("/users/{user}")]
    Task<User> GetUser(string user);

    [Post("/repos/{owner}/{repo}/issues")]
    [Headers("Authorization: Bearer")]
    Task CreateIssue(string owner, string repo, [Body] Issue issue);

    [Get]
    Task Broken();
}
`;
    expect(summary(refit)).toEqual([
      '3 client/caller GET /users/{user} refit',
      '6 client/caller POST /repos/{owner}/{repo}/issues refit',
    ]);
  });

  test('ignores an attribute section that never closes', () => {
    expect(summary('[HttpGet("x"\npublic IActionResult Broken() => Ok();\n')).toEqual([]);
  });
});
