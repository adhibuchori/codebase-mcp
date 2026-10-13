/**
 * Python web handlers. FastAPI and Flask decorators (`@router.get("/x")`, `@bp.route("/x",
 * methods=["GET", "POST"])`, one route per method, GET by default) take the prefix of the
 * `APIRouter(prefix=…)` or `Blueprint(…, url_prefix=…)` they belong to when it is created in the
 * same file, joined after what `include_router(…, prefix=…)` adds (Flask's `register_blueprint`
 * replaces it). Django URL confs (`path()`, `re_path()`, `url()`) declare no method: ANY.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import { withPrefix } from '../generic/route-scopes.ts';
import {
  argsOfCall,
  codeMatches,
  HASH_COMMENT,
  leadingString,
  quotedStrings,
} from '../generic/source-text.ts';

interface WebRouter {
  readonly prefix: string;
  readonly framework: string;
}

const ROUTER_DECL =
  /^[ \t]*([A-Za-z_]\w*)\s*(?::\s*\w+\s*)?=\s*(?:flask\.|fastapi\.)?(APIRouter|FastAPI|Blueprint|Flask)\(/gm;
const MOUNT_CALL = /\.(include_router|register_blueprint)\(/g;
const MOUNTED_NAME = /^\s*([A-Za-z_]\w*)\s*(?:,|$)/;
const PREFIX_OPTION = /\b(?:url_prefix|prefix)\s*=\s*[rf]?["']([^"'\n]*)["']/;
const DECORATOR =
  /^[ \t]*@([A-Za-z_]\w*)\.(get|post|put|delete|patch|head|options|route|api_route)\(/gm;
const METHODS_OPTION = /\bmethods\s*=\s*[[({]([^\])}]*)[\])}]/;
const DJANGO_PATH = /(?<![\w.])(?:path|re_path|url)\(/g;
const FLASK_IMPORT = /^\s*(?:from|import)\s+flask\b/m;
const FLASK_FACTORIES = new Set(['Blueprint', 'Flask']);

/** APIRouters, Blueprints and apps created in the file, with their prefix. */
function declaredRouters(text: string): Map<string, WebRouter> {
  const routers = new Map<string, WebRouter>();
  for (const match of codeMatches(text, ROUTER_DECL, HASH_COMMENT)) {
    const [, name = '', factory = ''] = match.groups;
    const prefix = PREFIX_OPTION.exec(argsOfCall(text, match))?.[1] ?? '';
    routers.set(name, { prefix, framework: FLASK_FACTORIES.has(factory) ? 'flask' : 'fastapi' });
  }
  return routers;
}

/** `app.include_router(router, prefix="/v1")` and `app.register_blueprint(bp, url_prefix="/v2")`. */
function applyMounts(text: string, routers: Map<string, WebRouter>): void {
  for (const match of codeMatches(text, MOUNT_CALL, HASH_COMMENT)) {
    const args = argsOfCall(text, match);
    const name = MOUNTED_NAME.exec(args)?.[1] ?? '';
    const router = routers.get(name);
    const mounted = PREFIX_OPTION.exec(args)?.[1];
    if (router && mounted !== undefined) {
      const replaces = match.groups[1] === 'register_blueprint';
      routers.set(name, {
        ...router,
        prefix: replaces ? mounted : withPrefix(mounted, router.prefix),
      });
    }
  }
}

function methodsOf(verb: string, args: string): string[] {
  if (verb !== 'route' && verb !== 'api_route') return [verb.toUpperCase()];
  const listed = quotedStrings(METHODS_OPTION.exec(args)?.[1] ?? '').map((method) =>
    method.toUpperCase(),
  );
  return listed.length > 0 ? listed : ['GET'];
}

function decoratorRoutes(text: string, routers: ReadonlyMap<string, WebRouter>): RouteDef[] {
  const fallback = FLASK_IMPORT.test(text) ? 'flask' : 'fastapi';
  return codeMatches(text, DECORATOR, HASH_COMMENT).flatMap((match) => {
    const [, receiver = '', verb = ''] = match.groups;
    const args = argsOfCall(text, match);
    const path = leadingString(args);
    if (path === undefined) return [];
    const router = routers.get(receiver);
    const pattern = withPrefix(router?.prefix ?? '', path);
    const framework = router?.framework ?? fallback;
    return methodsOf(verb, args).map((method): RouteDef => ({
      kind: 'http',
      role: 'handler',
      method,
      pattern,
      line: match.line,
      framework,
    }));
  });
}

/** Django URL confs only: the `urlpatterns` list marks one. */
function djangoRoutes(text: string): RouteDef[] {
  if (!text.includes('urlpatterns')) return [];
  return codeMatches(text, DJANGO_PATH, HASH_COMMENT).flatMap((match): RouteDef[] => {
    const pattern = leadingString(argsOfCall(text, match));
    if (pattern === undefined) return [];
    return [
      {
        kind: 'http',
        role: 'handler',
        method: 'ANY',
        pattern,
        line: match.line,
        framework: 'django',
      },
    ];
  });
}

export function pythonHttpRoutes(text: string): RouteDef[] {
  const routers = declaredRouters(text);
  applyMounts(text, routers);
  return [...decoratorRoutes(text, routers), ...djangoRoutes(text)];
}
