/**
 * Endpoint lookup across services, from the routes the indexer extracted: an HTTP path finds its
 * handler and the clients that call it, a gRPC "Service/Method" finds the proto definition, the
 * implementation and the stubs, and a topic finds its producers and consumers.
 */
import type { Repo, RouteHit } from '../core/model/domain.types.ts';
import { matchRoute } from '../core/routes/route-match.ts';
import type { EngineDeps } from './engine-deps.types.ts';

export type EndpointKind = 'http' | 'grpc' | 'topic';

export interface ScoredRoute {
  readonly route: RouteHit;
  readonly score: number;
}

export interface EndpointReport {
  readonly kind: EndpointKind;
  /** Handlers, consumers and proto definitions: where the request is served. */
  readonly serving: readonly ScoredRoute[];
  /** Callers and producers: who sends it. */
  readonly sending: readonly ScoredRoute[];
  readonly unindexed: readonly string[];
}

/** "/orders/1", "GET /x" or a URL is HTTP; "Svc/Method" or "Svc.Method" is gRPC; anything else a topic. */
export function detectKind(query: string): EndpointKind {
  const text = query.trim();
  if (/^(\/|[a-z]+:\/\/|(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s)/i.test(text)) return 'http';
  if (/^[A-Z][\w.]*[/.][A-Z]\w*$/.test(text)) return 'grpc';
  return 'topic';
}

function serviceName(name: string): string {
  return name.split('.').at(-1)?.toLowerCase() ?? '';
}

function grpcScore(query: string, pattern: string): number {
  const [wantedService = '', wantedMethod = ''] = query.replace('.', '/').split('/');
  const [service = '', method = ''] = pattern.split('/');
  if (serviceName(service) !== serviceName(wantedService)) return 0;
  if (method === wantedMethod) return 100;
  return method === '*' ? 60 : 0;
}

/** Exact name 100; a part of it 40; a name built from a placeholder ("${env}.orders") 40 when its fixed part is in the query. */
function topicScore(query: string, pattern: string): number {
  const wanted = query.trim().toLowerCase();
  const declared = pattern.toLowerCase();
  if (declared === wanted) return 100;
  if (declared.includes(wanted)) return 40;
  const fixed = declared.replace(/\$\{[^}]*\}/g, '');
  return fixed !== declared && fixed.length >= 3 && wanted.includes(fixed) ? 40 : 0;
}

function methodAllows(method: string, route: RouteHit): boolean {
  return (
    !method ||
    route.method === 'ANY' ||
    route.method === '' ||
    route.method.toUpperCase() === method.toUpperCase()
  );
}

function scoreRoute(
  input: { kind: EndpointKind; query: string; method: string },
  route: RouteHit,
): number {
  if (input.kind === 'grpc') return grpcScore(input.query, route.pattern);
  if (input.kind === 'topic') return topicScore(input.query, route.pattern);
  return methodAllows(input.method, route) ? matchRoute(input.query, route.pattern) : 0;
}

const KINDS: Readonly<Record<EndpointKind, readonly RouteHit['kind'][]>> = {
  http: ['http', 'client'],
  grpc: ['grpc'],
  topic: ['topic'],
};
const SENDING = new Set<RouteHit['role']>(['caller', 'producer']);

export function findEndpoints(
  deps: EngineDeps,
  input: { query: string; kind: EndpointKind; method: string; repos: readonly Repo[] },
): EndpointReport {
  const unindexed: string[] = [];
  const scored: ScoredRoute[] = [];
  for (const repo of input.repos) {
    if (deps.index.status(repo).indexedAt === 0 && deps.index.status(repo).state !== 'ready')
      unindexed.push(repo.slug);
    for (const route of deps.index.routes(repo, KINDS[input.kind])) {
      const value = scoreRoute(input, route);
      if (value > 0) scored.push({ route, score: value });
    }
  }
  const sorted = scored.toSorted(
    (a, b) => b.score - a.score || a.route.repo.localeCompare(b.route.repo),
  );
  return {
    kind: input.kind,
    serving: sorted.filter((entry) => !SENDING.has(entry.route.role)),
    sending: sorted.filter((entry) => SENDING.has(entry.route.role)),
    unindexed,
  };
}
