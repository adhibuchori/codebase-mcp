/**
 * NestJS controllers: `@Controller('orders')` (or `{ path: 'orders' }`) prefixes the handler
 * decorators that follow it (`@Get(':id')`, `@Post()`) until the next controller, so each of
 * several controllers in one file keeps its own prefix. Microservice handlers are read too:
 * `@MessagePattern` and `@EventPattern` consume a topic, and `@GrpcMethod('OrderService',
 * 'FindOne')` serves a gRPC method (named after the decorated method when the decorator omits it).
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import { joinRoute } from '../../core/routes/route-match.ts';
import type { LineMatch } from '../../core/text/lines.ts';
import {
  argsOfCall,
  C_STYLE_COMMENT,
  codeMatches,
  leadingString,
  quotedStrings,
} from '../generic/source-text.ts';

interface Decorator {
  readonly name: string;
  readonly args: string;
  readonly match: LineMatch;
}

const DECORATOR =
  /@(Controller|Get|Post|Put|Delete|Patch|All|Head|Options|MessagePattern|EventPattern|GrpcMethod|GrpcStreamMethod)\(/g;
const PATH_OPTION = /\bpath:\s*['"`]([^'"`\n]*)['"`]/;
const NEXT_METHOD = /\n\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/;
const TOPIC_DECORATORS = new Set(['MessagePattern', 'EventPattern']);
const GRPC_DECORATORS = new Set(['GrpcMethod', 'GrpcStreamMethod']);

const capitalized = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

function grpcRoute(text: string, decorator: Decorator): RouteDef[] {
  const [service, method] = quotedStrings(decorator.args);
  if (!service) return [];
  const { index, line } = decorator.match;
  const handlerName = NEXT_METHOD.exec(text.slice(index, index + 400))?.[1] ?? '*';
  const pattern = `${service}/${method ?? capitalized(handlerName)}`;
  return [{ kind: 'grpc', role: 'handler', method: 'RPC', pattern, line, framework: 'nestjs' }];
}

/** A topic pattern as written: the string's contents, or the object or constant itself. */
function topicRoute(decorator: Decorator): RouteDef {
  const pattern = leadingString(decorator.args) ?? decorator.args.trim();
  return {
    kind: 'topic',
    role: 'consumer',
    method: '',
    pattern,
    line: decorator.match.line,
    framework: 'nestjs',
  };
}

function httpRoutes(decorator: Decorator, prefix: string): RouteDef[] {
  const paths = quotedStrings(decorator.args);
  const method = decorator.name === 'All' ? 'ANY' : decorator.name.toUpperCase();
  return (paths.length > 0 ? paths : ['']).map((path) => ({
    kind: 'http',
    role: 'handler',
    method,
    pattern: joinRoute(prefix, path),
    line: decorator.match.line,
    framework: 'nestjs',
  }));
}

export function nestRoutes(text: string): RouteDef[] {
  const routes: RouteDef[] = [];
  let prefix = '';
  for (const match of codeMatches(text, DECORATOR, C_STYLE_COMMENT)) {
    const decorator: Decorator = {
      name: match.groups[1] ?? '',
      args: argsOfCall(text, match),
      match,
    };
    if (decorator.name === 'Controller') {
      prefix = PATH_OPTION.exec(decorator.args)?.[1] ?? leadingString(decorator.args) ?? '';
    } else if (GRPC_DECORATORS.has(decorator.name)) {
      routes.push(...grpcRoute(text, decorator));
    } else if (TOPIC_DECORATORS.has(decorator.name)) {
      routes.push(topicRoute(decorator));
    } else {
      routes.push(...httpRoutes(decorator, prefix));
    }
  }
  return routes;
}
