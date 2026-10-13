/**
 * The route extractor of the PHP pack: Laravel route files (`Route::get('/orders/{id}', …)`,
 * `Route::match(['get', 'post'], …)`, `Route::any(…)`, chained `Route::middleware(…)->post(…)`)
 * with the prefix of the `Route::prefix('api')->group(…)` or `Route::group(['prefix' => …])`
 * blocks they sit in, and Symfony controller routes, in line order.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import type { RouteExtractor } from '../../core/model/language-pack.types.ts';
import { scopedLines, scopePrefix, withPrefix, type ScopedLine } from '../generic/route-scopes.ts';
import { callArgs, leadingString, PHP_COMMENT, quotedStrings } from '../generic/source-text.ts';

import { symfonyRoutes } from './symfony-routes.ts';

const ROUTE_CALL = /(?:Route::|\)->)(get|post|put|patch|delete|options|any|match)\(/g;
const GROUP_CALL = /\bgroup\(/;
const GROUP_PREFIX =
  /(?:->|::)prefix\(\s*['"]([^'"]*)['"]\s*\)|['"]prefix['"]\s*=>\s*['"]([^'"]*)['"]/;
/** `Route::match(['get', 'post'], '/x', …)`: the verbs, then the path. */
const MATCH_ARGS = /^\s*\[([^\]]*)\]\s*,\s*['"]([^'"]*)['"]/;

/** The prefix a `->group(` line opens, "" for a group without one. */
function opensGroup(line: string): string | undefined {
  if (!GROUP_CALL.test(line) || PHP_COMMENT.test(line)) return undefined;
  const prefix = GROUP_PREFIX.exec(line);
  return prefix?.[1] ?? prefix?.[2] ?? '';
}

function endpointsOf(verb: string, args: string): { methods: string[]; path: string | undefined } {
  if (verb !== 'match')
    return { methods: [verb === 'any' ? 'ANY' : verb.toUpperCase()], path: leadingString(args) };
  const [, verbs = '', path] = MATCH_ARGS.exec(args) ?? [];
  return { methods: quotedStrings(verbs).map((method) => method.toUpperCase()), path };
}

function laravelRoutes(scoped: ScopedLine): RouteDef[] {
  if (!scoped.text.includes('Route::') || PHP_COMMENT.test(scoped.text)) return [];
  const prefix = scopePrefix(scoped.scopes);
  return [...scoped.text.matchAll(ROUTE_CALL)].flatMap((call) => {
    const [text, verb = ''] = call;
    const { methods, path } = endpointsOf(
      verb,
      callArgs(scoped.text, call.index + text.length - 1),
    );
    if (path === undefined) return [];
    const pattern = withPrefix(prefix, path);
    return methods.map((method): RouteDef => ({
      kind: 'http',
      role: 'handler',
      method,
      pattern,
      line: scoped.line,
      framework: 'laravel',
    }));
  });
}

export const phpRoutes: RouteExtractor = (text) =>
  [...scopedLines(text, opensGroup).flatMap(laravelRoutes), ...symfonyRoutes(text)].toSorted(
    (a, b) => a.line - b.line,
  );
