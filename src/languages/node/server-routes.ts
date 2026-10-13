/**
 * HTTP handlers registered in code by Express, Koa (koa-router), Hono and Fastify:
 * `router.get('/orders/:id', …)` and the calls chained on it (`.post(…).put(…)`, also straight
 * after `new Hono()`), `router.route('/x').get(…).put(…)` and `fastify.route({ method, url })`.
 * A router created in this file gets the prefix it is mounted at (`app.use('/api', router)`,
 * Hono's `app.route('/api', sub)`) plus its own (`new Router({ prefix })`, `.basePath()`). A mount
 * of anything imported cannot be resolved here, so the mount itself is an ANY route. A call used
 * as a value (awaited, returned, passed on) is a client call, not a registration.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import { withPrefix } from '../generic/route-scopes.ts';
import {
  C_STYLE_COMMENT,
  codeMatches,
  leadingString,
  linePrefix,
  quotedStrings,
} from '../generic/source-text.ts';
import { callOf, chainAfter, type Call, type Link } from './call-chains.ts';
import { clientInstances } from './client-calls.ts';

interface Router {
  readonly prefix: string;
  /** The calls chained on the factory: `new Hono().basePath('/api').get(…)`. */
  readonly chain: readonly Link[];
}

interface Mount {
  readonly parent: string;
  readonly path: string;
  readonly line: number;
  readonly children: readonly string[];
}

interface Context {
  readonly text: string;
  readonly framework: string;
  readonly receivers: ReadonlySet<string>;
  readonly prefixOf: (name: string) => string;
}

interface Endpoint {
  readonly method: string;
  readonly path: string;
}

const RECEIVERS = ['app', 'router', 'server', 'api', 'routes', 'r', 'fastify'];
const VERBS = new Set(['get', 'post', 'put', 'delete', 'del', 'patch', 'all', 'head', 'options']);
const ROUTER_DECL =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[\w$.<>]+\s*)?=\s*(?:new\s+)?(?:express\.|require\(['"]express['"]\)\.)?(?:Router|express|Hono|Koa|KoaRouter|Fastify|fastify)\s*\(/g;
const PREFIX_OPTION = /\bprefix:\s*['"`]([^'"`\n]*)['"`]/;
const VERB_CALL = /\b([A-Za-z_$][\w$]*)\s*\.(get|post|put|delete|del|patch|all|head|options)\(/g;
const MOUNT_CALL = /\b([A-Za-z_$][\w$]*)\.(?:use|route)\(/g;
const ROUTE_CALL = /\b([A-Za-z_$][\w$]*)\s*\.route\(/g;
const OBJECT_ARG = /^\s*\{/;
const URL_OPTION = /\b(?:url|path):\s*['"`]([^'"`\n]*)['"`]/;
const METHOD_OPTION = /\bmethod:\s*(\[[^\]]*\]|['"`]\w+['"`])/;
const VALUE_POSITION = /(?:\bawait|\breturn|\byield|[([,?:!&|])\s*$/;
const VERB_METHODS: ReadonlyMap<string, string> = new Map([
  ['all', 'ANY'],
  ['del', 'DELETE'],
]);
const FRAMEWORK_HINTS: readonly (readonly [RegExp, string])[] = [
  [/\bnew Hono\b|['"]hono['"]/, 'hono'],
  [/['"](?:@koa\/router|koa-router|koa)['"]/, 'koa'],
  [/\bfastify\b/i, 'fastify'],
];

const methodOf = (verb: string): string => VERB_METHODS.get(verb) ?? verb.toUpperCase();
const isPath = (value: string): boolean => value === '' || value === '*' || value.startsWith('/');

/** The path argument: the first string, or the second after a koa-router route name. */
function pathArg(args: string): string | undefined {
  const first = leadingString(args);
  if (first === undefined || isPath(first)) return first;
  const second = leadingString(args.slice(args.indexOf(',') + 1));
  return second !== undefined && isPath(second) ? second : undefined;
}

function handler(ctx: Context, endpoint: Endpoint, line: number): RouteDef {
  const { method, path } = endpoint;
  return { kind: 'http', role: 'handler', method, pattern: path, line, framework: ctx.framework };
}

/** The routes a chain of registrations declares on one receiver. */
function linkRoutes(ctx: Context, receiver: string, links: readonly Link[]): RouteDef[] {
  const prefix = ctx.prefixOf(receiver);
  return links.flatMap((link): RouteDef[] => {
    const path = VERBS.has(link.name) ? pathArg(link.args) : undefined;
    if (path === undefined) return [];
    return [
      handler(ctx, { method: methodOf(link.name), path: withPrefix(prefix, path) }, link.line),
    ];
  });
}

/** Routers and apps created in this file, with the prefix each declares for itself. */
function declaredRouters(text: string): Map<string, Router> {
  const routers = new Map<string, Router>();
  for (const match of codeMatches(text, ROUTER_DECL, C_STYLE_COMMENT)) {
    const call = callOf(text, match);
    const chain = chainAfter(text, call);
    const basePath = chain.find((link) => link.name === 'basePath');
    const prefix = PREFIX_OPTION.exec(call.args)?.[1] ?? leadingString(basePath?.args ?? '') ?? '';
    routers.set(match.groups[1] ?? '', { prefix, chain });
  }
  return routers;
}

/** `.use('/path', …)` and Hono's `.route('/path', sub)`, with the arguments after the path. */
function mountCalls(text: string): Mount[] {
  return codeMatches(text, MOUNT_CALL, C_STYLE_COMMENT).flatMap((match): Mount[] => {
    const { args, line } = callOf(text, match);
    const path = leadingString(args);
    const children = args
      .split(',')
      .slice(1)
      .map((arg) => arg.trim());
    if (path === undefined || !path.startsWith('/') || children.length === 0) return [];
    return [{ parent: match.groups[1] ?? '', path, line, children }];
  });
}

function prefixResolver(
  routers: ReadonlyMap<string, Router>,
  mounts: readonly Mount[],
): (name: string) => string {
  const mountOf = new Map<string, Mount>();
  for (const mount of mounts) {
    for (const child of mount.children) if (routers.has(child)) mountOf.set(child, mount);
  }
  const resolve = (name: string, depth: number): string => {
    const mount = depth < 8 ? mountOf.get(name) : undefined;
    const outer = mount ? withPrefix(resolve(mount.parent, depth + 1), mount.path) : '';
    return withPrefix(outer, routers.get(name)?.prefix ?? '');
  };
  return (name) => resolve(name, 0);
}

function verbRoutes(ctx: Context): RouteDef[] {
  return codeMatches(ctx.text, VERB_CALL, C_STYLE_COMMENT).flatMap((match): RouteDef[] => {
    const [, receiver = '', verb = ''] = match.groups;
    if (!ctx.receivers.has(receiver) || VALUE_POSITION.test(linePrefix(ctx.text, match.index)))
      return [];
    const call = callOf(ctx.text, match);
    return linkRoutes(ctx, receiver, [{ ...call, name: verb }, ...chainAfter(ctx.text, call)]);
  });
}

/** Fastify's `route({ method: ['GET', 'HEAD'], url: '/x' })`; ANY without a method. */
function fastifyRoute(args: string): Endpoint[] {
  const path = URL_OPTION.exec(args)?.[1];
  if (path === undefined) return [];
  const methods = quotedStrings(METHOD_OPTION.exec(args)?.[1] ?? '').map((method) =>
    method.toUpperCase(),
  );
  return (methods.length > 0 ? methods : ['ANY']).map((method) => ({ method, path }));
}

/** Express's `route('/x')`: one route per verb chained on it, ANY when none is. Hono mounts are skipped. */
function expressRoute(text: string, call: Call): Endpoint[] {
  const path = leadingString(call.args);
  if (path === undefined || call.args.includes(',')) return [];
  const verbs = chainAfter(text, call).filter((link) => VERBS.has(link.name));
  return (verbs.length > 0 ? verbs.map((link) => methodOf(link.name)) : ['ANY']).map((method) => ({
    method,
    path,
  }));
}

function routeCalls(ctx: Context): RouteDef[] {
  return codeMatches(ctx.text, ROUTE_CALL, C_STYLE_COMMENT).flatMap((match): RouteDef[] => {
    const receiver = match.groups[1] ?? '';
    if (!ctx.receivers.has(receiver)) return [];
    const call = callOf(ctx.text, match);
    const endpoints = OBJECT_ARG.test(call.args)
      ? fastifyRoute(call.args)
      : expressRoute(ctx.text, call);
    const prefix = ctx.prefixOf(receiver);
    return endpoints.map(({ method, path }) =>
      handler(ctx, { method, path: withPrefix(prefix, path) }, call.line),
    );
  });
}

/** A mount of nothing created here (an imported router, middleware): an ANY route at the mount path. */
function mountRoutes(
  ctx: Context,
  mounts: readonly Mount[],
  routers: ReadonlyMap<string, Router>,
): RouteDef[] {
  return mounts
    .filter(
      (mount) =>
        ctx.receivers.has(mount.parent) && !mount.children.some((child) => routers.has(child)),
    )
    .map((mount) => {
      const path = withPrefix(ctx.prefixOf(mount.parent), mount.path);
      return handler(ctx, { method: 'ANY', path }, mount.line);
    });
}

export function serverRoutes(text: string): RouteDef[] {
  const routers = declaredRouters(text);
  const mounts = mountCalls(text);
  const clients = clientInstances(text);
  const receivers = new Set([...RECEIVERS, ...routers.keys()].filter((name) => !clients.has(name)));
  const framework = FRAMEWORK_HINTS.find(([hint]) => hint.test(text))?.[1] ?? 'express';
  const ctx: Context = { text, framework, receivers, prefixOf: prefixResolver(routers, mounts) };
  return [
    ...verbRoutes(ctx),
    ...[...routers].flatMap(([name, router]) => linkRoutes(ctx, name, router.chain)),
    ...routeCalls(ctx),
    ...mountRoutes(ctx, mounts, routers),
  ];
}
