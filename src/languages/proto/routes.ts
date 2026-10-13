/**
 * gRPC methods as a .proto file defines them: every `rpc Method(` inside a `service Service {`
 * block is the definition "Service/Method", which the handlers and stubs found in code point to.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import type { RouteExtractor } from '../../core/model/language-pack.types.ts';
import { scopedLines } from '../generic/route-scopes.ts';

const SERVICE_LINE = /^\s*service\s+([A-Za-z_]\w*)/;
const RPC = /\brpc\s+([A-Za-z_]\w*)\s*\(/g;
const COMMENT_LINE = /^\s*\/\//;

export const protoRoutes: RouteExtractor = (text) =>
  scopedLines(text, (line) => SERVICE_LINE.exec(line)?.[1]).flatMap((scoped) => {
    const service = scoped.scopes.at(-1);
    if (service === undefined || COMMENT_LINE.test(scoped.text)) return [];
    return [...scoped.text.matchAll(RPC)].map((rpc): RouteDef => ({
      kind: 'grpc',
      role: 'definition',
      method: 'RPC',
      pattern: `${service}/${rpc[1] ?? ''}`,
      line: scoped.line,
      framework: 'protobuf',
    }));
  });
