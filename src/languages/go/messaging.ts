/**
 * Kafka topics and gRPC services in Go: kafka-go writers, readers and messages, sarama producers and
 * consumers, confluent-kafka-go subscriptions and messages, and grpc-go server registrations and
 * client constructors. A topic held in a variable resolves to the literal the file assigns it, else
 * stays as written.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import { matchLines } from '../../core/text/lines.ts';
import { goValue, type MaskedSource } from './syntax.ts';

const STRUCT =
  /\b(kafka\.(?:Writer|WriterConfig|ReaderConfig|Message)|sarama\.ProducerMessage)\s*\{/g;
const TOPIC_FIELD = /\bTopic:\s*(&?[\w.]+|"[^"\n]*")/;
const GROUP_TOPICS = /\bGroupTopics:\s*\[\]string\{([^}]*)\}/;
const LITERAL = /"([^"\n]*)"/g;
const CONSUME_PARTITION = /\.ConsumePartition\(\s*("[^"\n]*"|[\w.]+)/g;
const CONSUME_GROUP = /\.Consume\(\s*[\w.]+(?:\(\))?\s*,\s*\[\]string\{([^}]*)\}/g;
const SUBSCRIBE_TOPICS = /\.SubscribeTopics\(\s*\[\]string\{([^}]*)\}/g;
const SUBSCRIBE = /\.Subscribe\(\s*("[^"\n]*"|[\w.]+)\s*,/g;
const CONFLUENT = /confluent-kafka-go/;
const REGISTER = /\.Register(\w+)Server\(/g;
const NEW_CLIENT = /\b\w+\.New(\w+)Client\(\s*(?!ctx\b)[\w.]+\s*\)/g;
/** How far a struct literal that never closes is read. */
const MAX_BODY = 2000;

/** A factory for the topic routes of one role and library found on one line. */
function topic(
  role: RouteDef['role'],
  framework: string,
  line: number,
): (pattern: string) => RouteDef {
  return (pattern) => ({ kind: 'topic', role, method: '', pattern, line, framework });
}

const literals = (list: string): string[] =>
  [...list.matchAll(LITERAL)].map((match) => match[1] ?? '');

/** Which library a struct literal belongs to: confluent's Message wraps a TopicPartition. */
function libraryOf(type: string, body: string): string {
  if (type.startsWith('sarama')) return 'sarama';
  return type === 'kafka.Message' && body.includes('TopicPartition')
    ? 'confluent-kafka'
    : 'kafka-go';
}

/** The topics a `Topic:` or `GroupTopics:` field names. */
function fieldTopics(code: string, field: RegExpExecArray): string[] {
  const value = field[1] ?? '';
  return field[0].startsWith('Topic:') ? [goValue(code, value)] : literals(value);
}

/** kafka-go Writer, WriterConfig, ReaderConfig and Message, and sarama's ProducerMessage literals. */
function structTopics(source: MaskedSource): RouteDef[] {
  return matchLines(source.code, STRUCT).flatMap((match) => {
    const [text = '', type = ''] = match.groups;
    const open = match.index + text.length - 1;
    const close = source.closers.get(open) ?? open + MAX_BODY;
    const body = source.code.slice(open, close + 1);
    const field = TOPIC_FIELD.exec(body) ?? GROUP_TOPICS.exec(body);
    if (!field) return [];
    const line = match.line + body.slice(0, field.index).split('\n').length - 1;
    const role = type === 'kafka.ReaderConfig' ? 'consumer' : 'producer';
    return fieldTopics(source.code, field).map(topic(role, libraryOf(type, body), line));
  });
}

/** Consumer calls whose first argument (or topic list) names the topics. */
function consumerCalls(code: string): RouteDef[] {
  const single = (regex: RegExp, library: string): RouteDef[] =>
    matchLines(code, regex).map((m) =>
      topic('consumer', library, m.line)(goValue(code, m.groups[1] ?? '')),
    );
  const lists = (regex: RegExp, library: string): RouteDef[] =>
    matchLines(code, regex).flatMap((m) =>
      literals(m.groups[1] ?? '').map(topic('consumer', library, m.line)),
    );
  return [
    ...single(CONSUME_PARTITION, 'sarama'),
    ...lists(CONSUME_GROUP, 'sarama'),
    ...lists(SUBSCRIBE_TOPICS, 'confluent-kafka'),
    ...(CONFLUENT.test(code) ? single(SUBSCRIBE, 'confluent-kafka') : []),
  ];
}

function service(role: RouteDef['role'], name: string, line: number): RouteDef {
  return { kind: 'grpc', role, method: 'RPC', pattern: `${name}/*`, line, framework: 'grpc-go' };
}

/** pb.RegisterOrdersServer (not grpc-gateway's RegisterXHandlerServer) and pb.NewOrdersClient(conn). */
function grpcServices(code: string): RouteDef[] {
  const servers = matchLines(code, REGISTER)
    .filter((match) => !(match.groups[1] ?? '').endsWith('Handler'))
    .map((match) => service('handler', match.groups[1] ?? '', match.line));
  const clients = matchLines(code, NEW_CLIENT).map((match) =>
    service('caller', match.groups[1] ?? '', match.line),
  );
  return [...servers, ...clients];
}

/** Topics and gRPC services in masked Go source. */
export function goMessaging(source: MaskedSource): RouteDef[] {
  return [...structTopics(source), ...consumerCalls(source.code), ...grpcServices(source.code)];
}
