/**
 * Ruby HTTP routes: a Rails routes file (`get 'orders/:id', to: 'orders#show'`, `match …, via:
 * [...]`, `root`, `resources :orders`) and Sinatra handlers (`get '/orders/:id' do`). Rails
 * `namespace`/`scope` blocks, Sinatra `namespace` blocks and nested `resources … do` blocks prefix
 * the routes inside them. Only files that draw Rails routes or use Sinatra are read: the same
 * `get '/x'` shape in a request spec is a call, not a handler.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import type { RouteExtractor } from '../../core/model/language-pack.types.ts';
import { resourceRoutes, type ResourceRoute } from '../generic/rest-resources.ts';
import { scopedLines, scopePrefix, withPrefix } from '../generic/route-scopes.ts';
import { HASH_COMMENT } from '../generic/source-text.ts';

const VERB_LINE = /^\s*(get|post|put|patch|delete|options|head|match)[\s(]+['"]([^'"]*)['"](.*)$/;
const ROOT_LINE = /^\s*root\b/;
const RESOURCES_LINE = /^\s*resources[\s(]+:(\w+)(.*)$/;
const SCOPE_LINE = /^\s*(?:namespace|scope)[\s(]+(?:path:\s*)?(?::(\w+)|['"]([^'"]*)['"])/;
const BLOCK_START = /\bdo\s*(?:\|[^|]*\|\s*)?$/;
const VIA_OPTION = /\bvia:\s*(\[[^\]]*\]|:\w+)/;
const RAILS_ROUTES = /\broutes\.draw\b/;
const SINATRA = /\bSinatra\b|require\s+['"]sinatra/;

function frameworkOf(text: string): string | undefined {
  if (RAILS_ROUTES.test(text)) return 'rails';
  return SINATRA.test(text) ? 'sinatra' : undefined;
}

/** The prefix a block opens: a namespace or scope path, or a parent resource's member path. */
function opensScope(line: string): string | undefined {
  if (!BLOCK_START.test(line) || HASH_COMMENT.test(line)) return undefined;
  const scope = SCOPE_LINE.exec(line);
  if (scope) return scope[1] ?? scope[2] ?? '';
  const parent = RESOURCES_LINE.exec(line)?.[1];
  return parent === undefined ? undefined : `/${parent}/:${parent.replace(/s$/, '')}_id`;
}

/** `via: [:get, :post]` or `via: :all`; a `match` without `via` answers ANY. */
function viaMethods(options: string): string[] {
  const verbs = VIA_OPTION.exec(options)?.[1]?.match(/\w+/g) ?? ['all'];
  return verbs.map((verb) => (verb === 'all' ? 'ANY' : verb.toUpperCase()));
}

function verbRoutes(verb: RegExpExecArray): ResourceRoute[] {
  const [, name = '', path = '', options = ''] = verb;
  const methods = name === 'match' ? viaMethods(options) : [name.toUpperCase()];
  return methods.map((method) => ({ method, path }));
}

function routesOfLine(line: string): ResourceRoute[] {
  if (HASH_COMMENT.test(line)) return [];
  const verb = VERB_LINE.exec(line);
  if (verb) return verbRoutes(verb);
  if (ROOT_LINE.test(line)) return [{ method: 'GET', path: '/' }];
  const resource = RESOURCES_LINE.exec(line);
  return resource ? resourceRoutes(`/${resource[1] ?? ''}`, resource[2] ?? '') : [];
}

export const rubyRoutes: RouteExtractor = (text) => {
  const framework = frameworkOf(text);
  if (framework === undefined) return [];
  return scopedLines(text, opensScope).flatMap((scoped) => {
    const prefix = scopePrefix(scoped.scopes);
    return routesOfLine(scoped.text).map((route): RouteDef => ({
      kind: 'http',
      role: 'handler',
      method: route.method,
      pattern: withPrefix(prefix, route.path),
      line: scoped.line,
      framework,
    }));
  });
};
