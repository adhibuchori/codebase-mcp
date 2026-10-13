/**
 * Kafka topics and gRPC services in Node code. kafkajs: `producer.send({ topic })` and
 * `sendBatch({ topicMessages: [{ topic }] })` produce, `consumer.subscribe({ topic })` or
 * `{ topics: [...] }` consume; a topic given as a constant or a regex is kept as written.
 * @grpc/grpc-js: `server.addService(proto.OrderService.service, impl)` serves every method of
 * OrderService, and `new proto.OrderService(address, credentials)` is a client of it.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import { argsOfCall, C_STYLE_COMMENT, codeMatches, leadingString } from '../generic/source-text.ts';

const SEND_CALL = /\.(?:send|sendBatch)\((?=\s*\{)/g;
const SUBSCRIBE_CALL = /\.subscribe\((?=\s*\{)/g;
const TOPIC_OPTION = /\btopic:\s*(?:'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`|([^,}\n]+))/g;
const TOPICS_OPTION = /\btopics:\s*\[([^\]]*)\]/;
const ADD_SERVICE = /\.addService\(\s*([\w$.]+)/g;
const NEW_CLIENT = /\bnew\s+([\w$.]+)\s*\(/g;
/** A client takes channel credentials: `grpc.credentials.createInsecure()`, `creds`, `ChannelCredentials…`. */
const CREDENTIALS = /credential|\bcreds\b/i;

/** Every `topic:` value and `topics: [...]` item in a call's arguments. */
function topicsIn(args: string): string[] {
  const single = [...args.matchAll(TOPIC_OPTION)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4] ?? '');
  const listed = TOPICS_OPTION.exec(args)?.[1]?.split(',') ?? [];
  return [...single, ...listed]
    .map((item) => leadingString(item) ?? item.trim())
    .filter((topic) => topic !== '');
}

function topicRoutes(text: string, call: RegExp, role: RouteDef['role']): RouteDef[] {
  return codeMatches(text, call, C_STYLE_COMMENT).flatMap((match) =>
    topicsIn(argsOfCall(text, match)).map((pattern): RouteDef => ({
      kind: 'topic',
      role,
      method: '',
      pattern,
      line: match.line,
      framework: 'kafkajs',
    })),
  );
}

/** proto.OrderService.service → OrderService; generated OrderServiceService → OrderService. */
function serviceName(expression: string): string {
  const parts = expression.split('.');
  if (parts.at(-1) === 'service') return parts.at(-2) ?? '';
  return (parts.at(-1) ?? '').replace(/(.)Service$/, '$1');
}

function grpcRoutes(text: string): RouteDef[] {
  const servers = codeMatches(text, ADD_SERVICE, C_STYLE_COMMENT).map((match): RouteDef => {
    const pattern = `${serviceName(match.groups[1] ?? '')}/*`;
    return {
      kind: 'grpc',
      role: 'handler',
      method: 'RPC',
      pattern,
      line: match.line,
      framework: 'grpc-node',
    };
  });
  const clients = codeMatches(text, NEW_CLIENT, C_STYLE_COMMENT)
    .filter((match) => CREDENTIALS.test(argsOfCall(text, match)))
    .map((match): RouteDef => {
      const service = (match.groups[1] ?? '').split('.').at(-1) ?? '';
      const pattern = `${service.replace(/(.)Client$/, '$1')}/*`;
      return {
        kind: 'grpc',
        role: 'caller',
        method: 'RPC',
        pattern,
        line: match.line,
        framework: 'grpc-node',
      };
    });
  return [...servers, ...clients];
}

export function messagingRoutes(text: string): RouteDef[] {
  return [
    ...topicRoutes(text, SEND_CALL, 'producer'),
    ...topicRoutes(text, SUBSCRIBE_CALL, 'consumer'),
    ...grpcRoutes(text),
  ];
}
