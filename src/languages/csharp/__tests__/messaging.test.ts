/** Tests for C# topics (Confluent.Kafka, MassTransit) and gRPC services. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { csharpMessaging } from '../messaging.ts';
import { maskSource } from '../syntax.ts';

const summary = (code: string): string[] =>
  csharpMessaging(maskSource(code))
    .toSorted((a, b) => a.line - b.line)
    .map((r: RouteDef) => `${r.line} ${r.kind}/${r.role} ${r.pattern} ${r.framework}`);

describe('csharpMessaging with Kafka and MassTransit', () => {
  test('reads consumer subscriptions, producers and receive endpoints', () => {
    const worker = `public sealed class OrderWorker(IConsumer<string, string> consumer, IProducer<string, string> producer) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        consumer.Subscribe("orders.created");
        consumer.Subscribe(new[] { "payments", "refunds" });
        _consumer.Subscribe(_options.Topic);
        _updates.Subscribe(update => Console.WriteLine(update));
        await producer.ProduceAsync("order-events", new Message<string, string> { Key = "k", Value = "v" });
        producer.Produce(_options.AuditTopic, message, report => { });
        _router.Produce(message);
    }
}

services.AddMassTransit(x => x.UsingRabbitMq((context, cfg) =>
    cfg.ReceiveEndpoint("order-submitted", e => e.ConfigureConsumer<OrderSubmittedConsumer>(context))));
`;
    expect(summary(worker)).toEqual([
      '5 topic/consumer orders.created confluent-kafka',
      '6 topic/consumer payments confluent-kafka',
      '6 topic/consumer refunds confluent-kafka',
      '7 topic/consumer _options.Topic confluent-kafka',
      '9 topic/producer order-events confluent-kafka',
      '10 topic/producer _options.AuditTopic confluent-kafka',
      '16 topic/consumer order-submitted masstransit',
    ]);
  });
});

describe('csharpMessaging with gRPC', () => {
  test('reads service implementations and generated clients whose names agree', () => {
    const code = `builder.Services.AddGrpcClient<Inventory.InventoryClient>(o => o.Address = new Uri("https://inventory"));
var payments = new Acme.Payments.V1.Payments.PaymentsClient(channel);
var s3 = new Amazon.S3.AmazonS3Client(config);

public class OrdersService(ILogger<OrdersService> logger) : Orders.OrdersBase
{
}

public class Handler : Acme.Shared.HandlerBase
{
}
`;
    expect(summary(code)).toEqual([
      '1 grpc/caller Inventory/* grpc-dotnet',
      '2 grpc/caller Payments/* grpc-dotnet',
      '5 grpc/handler Orders/* grpc-dotnet',
    ]);
  });
});
