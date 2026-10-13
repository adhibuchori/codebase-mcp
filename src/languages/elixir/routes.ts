/**
 * Phoenix routers: `get "/orders/:id", OrderController, :show`, `live "/orders", OrderLive.Index`,
 * `forward "/admin", AdminRouter` and `resources "/users", UserController, only: [...]`, prefixed
 * by the `scope "/api", MyAppWeb do` blocks they sit in.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import type { RouteExtractor } from '../../core/model/language-pack.types.ts';
import { resourceRoutes, type ResourceRoute } from '../generic/rest-resources.ts';
import { scopedLines, scopePrefix, withPrefix } from '../generic/route-scopes.ts';
import { HASH_COMMENT } from '../generic/source-text.ts';

const SCOPE_LINE = /^\s*scope\s+"([^"]*)"/;
const VERB_LINE = /^\s*(get|post|put|patch|delete|options|head|forward|live)\s+"([^"]*)"/;
const RESOURCES_LINE = /^\s*resources\s+"([^"]*)",\s*[\w.]+(.*)$/;
/** LiveView pages are served by GET; a forwarded path answers whatever the target router does. */
const VERB_METHODS: ReadonlyMap<string, string> = new Map([
  ['live', 'GET'],
  ['forward', 'ANY'],
]);

function routesOfLine(line: string): ResourceRoute[] {
  if (HASH_COMMENT.test(line)) return [];
  const verb = VERB_LINE.exec(line);
  if (verb) {
    const [, name = '', path = ''] = verb;
    return [{ method: VERB_METHODS.get(name) ?? name.toUpperCase(), path }];
  }
  const resource = RESOURCES_LINE.exec(line);
  return resource ? resourceRoutes(resource[1] ?? '', resource[2] ?? '') : [];
}

export const elixirRoutes: RouteExtractor = (text) =>
  scopedLines(text, (line) => SCOPE_LINE.exec(line)?.[1]).flatMap((scoped) => {
    const prefix = scopePrefix(scoped.scopes);
    return routesOfLine(scoped.text).map((route): RouteDef => ({
      kind: 'http',
      role: 'handler',
      method: route.method,
      pattern: withPrefix(prefix, route.path),
      line: scoped.line,
      framework: 'phoenix',
    }));
  });
