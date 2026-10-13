/**
 * Message topics and gRPC services in C#: Confluent.Kafka consumers (Subscribe) and producers
 * (Produce, ProduceAsync), MassTransit receive endpoints, Grpc.AspNetCore service implementations
 * (`class X : Orders.OrdersBase`) and generated clients (`new Orders.OrdersClient(channel)`,
 * `AddGrpcClient<Orders.OrdersClient>`). A topic held in a field or an option is kept as written.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import { matchLines } from '../../core/text/lines.ts';
import { firstArgument, valuesOf, type MaskedSource } from './syntax.ts';

const SUBSCRIBE = /\b(\w+)\.Subscribe\(/g;
const PRODUCE = /\b(\w+)\.(?:ProduceAsync|Produce)\(/g;
const RECEIVE_ENDPOINT = /\.ReceiveEndpoint\(\s*"([^"\n]*)"/g;
const GRPC_SERVICE = /\bclass\s+\w+\b[^:{;]*:\s*(?:\w+\.)*(\w+)\.(\w+)Base\b/g;
const GRPC_CLIENT = /(?:\bnew\s+|AddGrpcClient<\s*)(?:\w+\.)*(\w+)\.(\w+)Client\b/g;
/** Subscribe and Produce are common names: without a literal, the receiver must look like Kafka. */
const KAFKA_RECEIVER = /consumer|producer|kafka/i;

function topic(
  role: RouteDef['role'],
  framework: string,
  line: number,
): (pattern: string) => RouteDef {
  return (pattern) => ({ kind: 'topic', role, method: '', pattern, line, framework });
}

function service(role: RouteDef['role'], name: string, line: number): RouteDef {
  return {
    kind: 'grpc',
    role,
    method: 'RPC',
    pattern: `${name}/*`,
    line,
    framework: 'grpc-dotnet',
  };
}

/** Topics named by the first argument of Subscribe (consumer) or Produce (producer) calls. */
function kafkaCalls(source: MaskedSource, regex: RegExp, role: RouteDef['role']): RouteDef[] {
  return matchLines(source.code, regex).flatMap((match) => {
    const [text = '', receiver = ''] = match.groups;
    const argument = firstArgument(source, match.index + text.length - 1);
    const literal = argument.includes('"');
    if (!literal && !KAFKA_RECEIVER.test(receiver)) return [];
    const topics = valuesOf(argument);
    return (role === 'producer' ? topics.slice(0, 1) : topics).map(
      topic(role, 'confluent-kafka', match.line),
    );
  });
}

/** gRPC classes whose generated names agree: Orders.OrdersBase, Orders.OrdersClient. */
function grpcServices(code: string, regex: RegExp, role: RouteDef['role']): RouteDef[] {
  return matchLines(code, regex)
    .filter((match) => match.groups[1] === match.groups[2])
    .map((match) => service(role, match.groups[1] ?? '', match.line));
}

/** Topics and gRPC services in masked C# source. */
export function csharpMessaging(source: MaskedSource): RouteDef[] {
  const endpoints = matchLines(source.code, RECEIVE_ENDPOINT).map((match) =>
    topic('consumer', 'masstransit', match.line)(match.groups[1] ?? ''),
  );
  return [
    ...kafkaCalls(source, SUBSCRIBE, 'consumer'),
    ...kafkaCalls(source, PRODUCE, 'producer'),
    ...endpoints,
    ...grpcServices(source.code, GRPC_SERVICE, 'handler'),
    ...grpcServices(source.code, GRPC_CLIENT, 'caller'),
  ];
}
