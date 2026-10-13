/**
 * Message topics and gRPC services on the JVM: Spring Kafka and Spring AMQP listeners and
 * templates, plain Kafka producer records, and grpc-java service implementations and stubs (the
 * Kotlin and ScalaPB variants share their names). A topic given as a constant or a placeholder is
 * kept as written ("${app.topics.orders}", "ORDERS_TOPIC"), which is what a search finds it by.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import type { RouteExtractor } from '../../core/model/language-pack.types.ts';
import { matchLines } from '../../core/text/lines.ts';
import {
  annotationsIn,
  argumentsAt,
  attributeValues,
  maskSource,
  splitArguments,
  valuesOf,
  type Annotation,
  type MaskedSource,
} from './syntax.ts';

const TOPIC_PARTITION = /@TopicPartition\s*\(\s*topic\s*=\s*"((?:[^"\\\n]|\\.)*)"/g;
const QUEUE = /@Queue\s*\(\s*(?:(?:value|name)\s*=\s*)?"((?:[^"\\\n]|\\.)*)"/g;
const SEND = /\b(\w+)\s*\.\s*(send|convertAndSend|convertSendAndReceive)\s*\(/g;
const PRODUCER_RECORD = /\bnew\s+ProducerRecord(?:\s*<[^<>()]*>|\s*\[[^[\]()]*\])?\s*\(/g;
const GRPC_SERVER =
  /(?:\bextends|:)\s*(?:[\w.]*\.)?(\w+)Grpc(?:Kt)?\.\w*ImplBase\b|\b(\w+)Grpc\.bindService\s*\(/g;
const GRPC_CLIENT =
  /\b(\w+)Grpc(?:Kt)?\s*\.\s*(?:newBlockingStub|newStub|newFutureStub|blockingStub|stub|\w+CoroutineStub)\s*\(/g;
const RABBIT = /rabbit|amqp/i;
const KAFKA = /kafka/i;

const captured = (text: string, regex: RegExp): string[] =>
  [...text.matchAll(regex)].map((match) => match[1] ?? '');

function kafkaTopics(annotation: Annotation): string[] {
  const topics = attributeValues(annotation.args, ['topics', 'value', 'topicPattern']);
  return topics.length > 0 ? topics : captured(annotation.text, TOPIC_PARTITION);
}

function rabbitQueues(annotation: Annotation): string[] {
  const queues = attributeValues(annotation.args, ['queues']);
  return queues.length > 0 ? queues : captured(annotation.text, QUEUE);
}

/** A factory for the topic routes of one role and framework found on one line. */
function topicRoute(
  role: RouteDef['role'],
  framework: string,
  line: number,
): (pattern: string) => RouteDef {
  return (pattern) => ({ kind: 'topic', role, method: '', pattern, line, framework });
}

function listeners(source: MaskedSource): RouteDef[] {
  return annotationsIn(source).flatMap((annotation): RouteDef[] => {
    if (annotation.name === 'KafkaListener') {
      return kafkaTopics(annotation).map(topicRoute('consumer', 'spring-kafka', annotation.line));
    }
    if (annotation.name === 'RabbitListener') {
      return rabbitQueues(annotation).map(topicRoute('consumer', 'rabbitmq', annotation.line));
    }
    return [];
  });
}

/** Which broker a template call talks to, judged by the receiver's name; "" when it is neither. */
function brokerOf(receiver: string, call: string): string {
  if (RABBIT.test(receiver)) return 'rabbitmq';
  return call === 'send' && (KAFKA.test(receiver) || receiver === 'template') ? 'spring-kafka' : '';
}

/** The first argument of the call opened at `open`, or "" when it has fewer than `min` arguments. */
function firstArgument(source: MaskedSource, open: number, min: number): string {
  const args = argumentsAt(source, open);
  const parts = args ? splitArguments(args) : [];
  return parts.length >= min ? (parts[0]?.value.trim() ?? '') : '';
}

function producers(source: MaskedSource): RouteDef[] {
  const sends = matchLines(source.code, SEND).map((match) => {
    const [text = '', receiver = '', call = ''] = match.groups;
    const topic = firstArgument(source, match.index + text.length - 1, 2);
    const framework = topic.startsWith('new ') ? '' : brokerOf(receiver, call);
    return { line: match.line, topic, framework };
  });
  const records = matchLines(source.code, PRODUCER_RECORD).map((match) => {
    const topic = firstArgument(source, match.index + (match.groups[0]?.length ?? 1) - 1, 1);
    return { line: match.line, topic, framework: 'kafka' };
  });
  return [...sends, ...records].flatMap(({ line, topic, framework }): RouteDef[] => {
    const pattern = valuesOf(topic)[0];
    return framework && pattern ? [topicRoute('producer', framework, line)(pattern)] : [];
  });
}

function grpcServices(code: string): RouteDef[] {
  const servers = matchLines(code, GRPC_SERVER).map((match): RouteDef => ({
    kind: 'grpc',
    role: 'handler',
    method: 'RPC',
    pattern: `${match.groups[1] ?? match.groups[2] ?? ''}/*`,
    line: match.line,
    framework: 'grpc-java',
  }));
  const clients = matchLines(code, GRPC_CLIENT).map((match): RouteDef => ({
    kind: 'grpc',
    role: 'caller',
    method: 'RPC',
    pattern: `${match.groups[1] ?? ''}/*`,
    line: match.line,
    framework: 'grpc-java',
  }));
  return [...servers, ...clients];
}

export const jvmMessaging: RouteExtractor = (text) => {
  const source = maskSource(text);
  return [...listeners(source), ...producers(source), ...grpcServices(source.code)].toSorted(
    (a, b) => a.line - b.line,
  );
};
