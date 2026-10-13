/**
 * Kafka topics and gRPC services in Python. kafka-python and aiokafka: `KafkaConsumer("orders",
 * …)` and `consumer.subscribe([...])` consume, `producer.send("orders", …)` produces;
 * confluent-kafka: `consumer.subscribe([...])` and `producer.produce("orders", …)`. A topic given
 * as a constant is kept as written. grpcio: `add_OrderServiceServicer_to_server(…)` serves
 * OrderService and `OrderServiceStub(channel)` calls it; the generated *_pb2_grpc module, which
 * defines both, yields neither.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import type { LineMatch } from '../../core/text/lines.ts';
import {
  argsOfCall,
  codeMatches,
  HASH_COMMENT,
  leadingString,
  quotedStrings,
} from '../generic/source-text.ts';

const CONSUMER_NEW = /\b(AIOKafkaConsumer|KafkaConsumer)\(/g;
const SUBSCRIBE_CALL = /\b(\w+)\.subscribe\(/g;
/** A Kafka subscription: on a consumer, or with Kafka's arguments (a list, `topics=`, `pattern=`). */
const CONSUMER_NAME = /consumer/i;
const KAFKA_ARGS = /^\s*(?:\[|topics\s*=|pattern\s*=)/;
const PRODUCE_CALL = /\b\w*producer\.(send_and_wait|send|produce)\(/gi;
const GRPC_SERVER = /(?<!def )\badd_(\w+?)Servicer_to_server\(/g;
const GRPC_STUB = /(?<!class )\b(\w+)Stub\(/g;
const KEYWORD_ARG = /\b\w+\s*=/;
const TOPIC_KEYWORD = /^\s*topic\s*=\s*/;
const EXPRESSION = /^\s*([A-Za-z_][\w.]*)/;
const LIBRARY_IMPORTS: readonly (readonly [RegExp, string])[] = [
  [/\bconfluent_kafka\b/, 'confluent-kafka'],
  [/\baiokafka\b/, 'aiokafka'],
];
const CALL_LIBRARIES: ReadonlyMap<string, string> = new Map([
  ['AIOKafkaConsumer', 'aiokafka'],
  ['KafkaConsumer', 'kafka-python'],
  ['send_and_wait', 'aiokafka'],
  ['produce', 'confluent-kafka'],
]);

function kafkaLibrary(text: string): string {
  return LIBRARY_IMPORTS.find(([imported]) => imported.test(text))?.[1] ?? 'kafka-python';
}

function topic(
  role: RouteDef['role'],
  framework: string,
  line: number,
): (pattern: string) => RouteDef {
  return (pattern) => ({ kind: 'topic', role, method: '', pattern, line, framework });
}

/** `subscribe(["a", "b"])`, `subscribe(topics=[...])`, `subscribe(pattern="^orders")`, or a constant. */
function subscribedTopics(args: string): string[] {
  const literals = quotedStrings(args);
  if (literals.length > 0) return literals;
  const expression = args.trim().replace(/^\[|\]$/g, '');
  return expression ? [expression] : [];
}

function consumers(text: string, kafka: string): RouteDef[] {
  const created = codeMatches(text, CONSUMER_NEW, HASH_COMMENT).flatMap((match) => {
    const positional = argsOfCall(text, match).split(KEYWORD_ARG)[0] ?? '';
    const framework = CALL_LIBRARIES.get(match.groups[1] ?? '') ?? kafka;
    return quotedStrings(positional).map(topic('consumer', framework, match.line));
  });
  const subscribed = codeMatches(text, SUBSCRIBE_CALL, HASH_COMMENT).flatMap((match) => {
    const args = argsOfCall(text, match);
    if (!CONSUMER_NAME.test(match.groups[1] ?? '') && !KAFKA_ARGS.test(args)) return [];
    return subscribedTopics(args).map(topic('consumer', kafka, match.line));
  });
  return [...created, ...subscribed];
}

function producers(text: string, kafka: string): RouteDef[] {
  return codeMatches(text, PRODUCE_CALL, HASH_COMMENT).flatMap((match) => {
    const first = argsOfCall(text, match).replace(TOPIC_KEYWORD, '');
    const pattern = leadingString(first) ?? EXPRESSION.exec(first)?.[1];
    const framework = CALL_LIBRARIES.get(match.groups[1] ?? '') ?? kafka;
    return pattern === undefined ? [] : [topic('producer', framework, match.line)(pattern)];
  });
}

/** A factory for the route of a gRPC service whose name a match captured. */
function service(role: RouteDef['role']): (match: LineMatch) => RouteDef {
  return (match) => {
    const pattern = `${match.groups[1] ?? ''}/*`;
    return {
      kind: 'grpc',
      role,
      method: 'RPC',
      pattern,
      line: match.line,
      framework: 'grpc-python',
    };
  };
}

function grpcRoutes(text: string): RouteDef[] {
  return [
    ...codeMatches(text, GRPC_SERVER, HASH_COMMENT).map(service('handler')),
    ...codeMatches(text, GRPC_STUB, HASH_COMMENT).map(service('caller')),
  ];
}

export function pythonMessaging(text: string): RouteDef[] {
  const kafka = kafkaLibrary(text);
  return [...consumers(text, kafka), ...producers(text, kafka), ...grpcRoutes(text)];
}
