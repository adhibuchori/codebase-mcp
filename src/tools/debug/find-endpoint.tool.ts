/** find_endpoint: an HTTP route, gRPC method or message topic → who serves it and who calls it. */
import { z } from 'zod';
import { takeBlocks } from '../../core/output/budget.ts';
import { detectKind, findEndpoints } from '../../engine/endpoints.ts';
import { resolveRepos } from '../../engine/repo-scope.ts';
import { defineTool } from '../registry/define-tool.ts';
import { groupField, limitField, reposField } from '../registry/shared-input.ts';
import { endpointBlocks } from './debug.format.ts';

export const findEndpointTool = defineTool({
  name: 'find_endpoint',
  title: 'Find endpoint',
  description:
    'Follows a request across services. An HTTP path ("/orders/123/cancel", "POST /api/orders/{id}" or a full URL; concrete ids match route parameters) returns the handler and the clients that call it (Feign, RestTemplate, WebClient, axios, fetch, requests, HttpClient, …). A gRPC "Service/Method" returns the .proto definition, the implementation and the stubs. A topic name returns its producers and consumers (Kafka, RabbitMQ). Example: {"query": "POST /api/orders/42/cancel"} or {"query": "orders.cancelled"}.',
  input: {
    query: z
      .string()
      .min(1)
      .max(500)
      .describe('HTTP path or URL, gRPC Service/Method, or topic name.'),
    kind: z.enum(['auto', 'http', 'grpc', 'topic']).default('auto'),
    method: z.string().optional().describe('HTTP method to require, e.g. "POST".'),
    repos: reposField,
    group: groupField,
    limit: limitField(15, 50),
  },
  run: async (args, context) => {
    const kind = args.kind === 'auto' ? detectKind(args.query) : args.kind;
    const method =
      args.method ?? /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/i.exec(args.query)?.[1] ?? '';
    const repos = resolveRepos(context.deps.repos, args.repos, args.group);
    const report = findEndpoints(context.deps, { query: args.query, kind, method, repos });
    return takeBlocks(endpointBlocks(args.query, report, args.limit), context.budget).text;
  },
});
