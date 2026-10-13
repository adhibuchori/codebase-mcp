/** Tests for the C# pack: regex symbols, project-file framework rules and log calls. */
import { describe, expect, test } from 'bun:test';
import { csharpPack } from '../pack.ts';

/** The first pattern that names each line, as the regex symbol fallback applies them. */
function symbolsOf(source: string): string[] {
  return source.split('\n').flatMap((line) => {
    for (const pattern of csharpPack.symbolPatterns ?? []) {
      const name = pattern.regex.exec(line)?.[1];
      if (name) return [`${pattern.kind} ${name}`];
    }
    return [];
  });
}

const detect = (path: string, content: string): string[] =>
  (csharpPack.frameworks ?? [])
    .filter((rule) => rule.file.test(path) && rule.contains.test(content))
    .map((rule) => rule.name);

describe('csharpPack', () => {
  test('describes C#', () => {
    expect(csharpPack).toMatchObject({
      id: 'csharp',
      name: 'C#',
      tier: 1,
      extensions: ['.cs'],
      grammar: 'csharp',
    });
  });

  test('finds classes, interfaces, records, structs, enums and methods', () => {
    const source = `namespace Acme.Orders;

public sealed partial class OrderService : IOrderService
{
    public async Task<IReadOnlyList<OrderDto>> ListAsync(CancellationToken token) => [];
    private static Dictionary<string, int> Index(IEnumerable<Order> orders) => new();
    public T Map<T>(Order order) where T : new() => new T();
    var total = orders.Sum(order => order.Total);
}
public interface IOrderService { }
public record OrderDto(Guid Id, decimal Total);
public readonly record struct Money(decimal Amount, string Currency);
internal readonly struct Point { }
public enum Status { Open, Cancelled }
`;
    expect(symbolsOf(source)).toEqual([
      'class OrderService',
      'method ListAsync',
      'method Index',
      'method Map',
      'interface IOrderService',
      'record OrderDto',
      'record Money',
      'struct Point',
      'enum Status',
    ]);
  });

  test('detects frameworks in a project file', () => {
    const csproj = `<Project Sdk="Microsoft.NET.Sdk.Web">
  <ItemGroup>
    <PackageReference Include="Grpc.AspNetCore" Version="2.62.0" />
    <PackageReference Include="Confluent.Kafka" Version="2.4.0" />
    <PackageReference Include="MassTransit.RabbitMQ" Version="8.2.2" />
  </ItemGroup>
</Project>`;
    expect(detect('src/Acme.Orders.Api/Acme.Orders.Api.csproj', csproj)).toEqual([
      'aspnetcore',
      'grpc-aspnetcore',
      'confluent-kafka',
      'masstransit',
    ]);
    const library =
      '<Project Sdk="Microsoft.NET.Sdk">\n  <PackageReference Include="Microsoft.AspNetCore.Mvc.Core" Version="2.2.5" />\n</Project>';
    expect(detect('Acme.Shared.csproj', library)).toEqual(['aspnetcore']);
    expect(detect('Directory.Build.props', csproj)).toEqual([]);
  });

  test('recognises logger and throw statements', () => {
    const calls = [
      '_logger.LogError(ex, "Order {OrderId} could not be cancelled", id);',
      'logger.LogInformation("Order {OrderId} created", id);',
      'Log.Error(ex, "Payment {PaymentId} failed", paymentId);',
      '_log.Warn("Retrying payment");',
      'throw new InvalidOperationException($"Order {id} is closed");',
    ];
    expect(calls.filter((line) => csharpPack.logCall?.test(line))).toEqual(calls);
    expect(csharpPack.logCall?.test('var catalog = _catalog.Error;')).toBe(false);
  });
});
