/**
 * HTTP handlers registered on Go routers: gin, echo, fiber, chi, gorilla/mux and net/http (with Go
 * 1.22 "GET /orders/{id}" patterns). Group prefixes are resolved per variable within the file
 * (`api := r.Group("/api")`, nested groups too), and a chi or fiber `Route("/x", func(r …) {…})`
 * block lends its prefix to the routes inside its braces. The router is told apart by the import.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import { joinRoute } from '../../core/routes/route-match.ts';
import { braceDelta, type MaskedSource } from './syntax.ts';

/** A `Route("/x", func(r chi.Router) {` block: the router variable inside it, and its body depth. */
interface Scope {
  readonly name: string;
  readonly prefix: string;
  readonly depth: number;
}

interface Router {
  /** gin, echo, fiber, chi or gorilla, from the file's imports; "" for net/http only. */
  readonly framework: string;
  readonly groups: Map<string, string>;
  readonly scopes: Scope[];
  depth: number;
}

/** One line of comment-free code, the line after it, and its 1-based number. */
interface Line {
  readonly code: string;
  readonly next: string;
  readonly number: number;
}

const IMPORTS: readonly (readonly [RegExp, string])[] = [
  [/"github\.com\/gin-gonic\/gin"/, 'gin'],
  [/"github\.com\/labstack\/echo/, 'echo'],
  [/"github\.com\/gofiber\/fiber/, 'fiber'],
  [/"github\.com\/go-chi\/chi/, 'chi'],
  [/"github\.com\/gorilla\/mux"/, 'gorilla'],
];
const SCOPE = /\b(\w+)\.Route\(\s*"([^"]*)"\s*,\s*func\s*\(\s*(\w+)/;
const GROUP = /\b(\w+)\s*:?=\s*(\w+)\.(?:Group|PathPrefix)\(\s*"([^"]*)"/;
const METHOD_FIRST =
  /\.(Handle|Add|Method|MethodFunc)\(\s*(?:"([A-Z]+)"|http\.Method(\w+))\s*,\s*"([^"]*)"/;
const VERB =
  /\.(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|Any|Get|Post|Put|Delete|Patch|Head|Options|All)\(\s*"(\/[^"]*|)"\s*,/;
const HANDLE = /\b(\w+)\.(?:HandleFunc|Handle)\(\s*"([^"]*)"/;
const METHODS = /\.\s*Methods\(([^)]*)\)/;
const METHOD_NAME = /"([A-Z]+)"|http\.Method(\w+)/g;
const METHOD_PREFIX = /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|CONNECT|TRACE)\s+(.*)$/;
const LAST_WORD = /(\w+)$/;
const FIRST_WORD = /^\s*(\w+)/;
/** The router each call shape belongs to when the imports do not say. */
const METHOD_FIRST_ROUTER: ReadonlyMap<string, string> = new Map([
  ['Handle', 'gin'],
  ['Add', 'echo'],
  ['Method', 'chi'],
  ['MethodFunc', 'chi'],
]);

function prefixOf(router: Router, name: string): string {
  return (
    router.scopes.findLast((scope) => scope.name === name)?.prefix ?? router.groups.get(name) ?? ''
  );
}

/** The variable a call is made on: the identifier before the dot, else the line's first word. */
function receiverAt(code: string, index: number): string {
  const before = LAST_WORD.exec(code.slice(Math.max(0, index - 64), index));
  return before?.[1] ?? FIRST_WORD.exec(code)?.[1] ?? '';
}

function handler(framework: string, method: string, line: number): (pattern: string) => RouteDef {
  return (pattern) => ({ kind: 'http', role: 'handler', method, pattern, line, framework });
}

/** gin's Handle("GET", …), echo's Add, chi's Method and MethodFunc: the verb comes first. */
function methodFirst(router: Router, line: Line): RouteDef[] {
  const match = METHOD_FIRST.exec(line.code);
  if (!match) return [];
  const [, call = '', literal, constant, path = ''] = match;
  const framework = router.framework || (METHOD_FIRST_ROUTER.get(call) ?? 'gin');
  const method = (literal ?? constant ?? '').toUpperCase();
  const prefix = prefixOf(router, receiverAt(line.code, match.index));
  return [handler(framework, method, line.number)(joinRoute(prefix, path))];
}

/** r.GET("/x", h) on gin and echo; r.Get("/x", h) on chi and fiber; Any and All for every verb. */
function verbCall(router: Router, line: Line): RouteDef[] {
  const match = VERB.exec(line.code);
  if (!match) return [];
  const [, verb = '', path = ''] = match;
  const upperCase = verb === verb.toUpperCase() || verb === 'Any';
  const family = upperCase ? ['gin', 'echo'] : ['chi', 'fiber'];
  const framework = family.includes(router.framework) ? router.framework : (family[0] ?? '');
  const method = verb === 'Any' || verb === 'All' ? 'ANY' : verb.toUpperCase();
  const prefix = prefixOf(router, receiverAt(line.code, match.index));
  return [handler(framework, method, line.number)(joinRoute(prefix, path))];
}

/** gorilla's `.Methods("GET", http.MethodPost)`, on this line or a continuation line. */
function gorillaMethods(line: Line): string[] {
  const text = line.code.trimEnd().endsWith('.') ? `${line.code} ${line.next}` : line.code;
  const args = METHODS.exec(text)?.[1] ?? '';
  return [...args.matchAll(METHOD_NAME)].map((match) => (match[1] ?? match[2] ?? '').toUpperCase());
}

/** gorilla when `.Methods(…)` follows or the file imports it, chi likewise, else net/http. */
function handleFramework(router: Router, receiver: string, methods: readonly string[]): string {
  const routed = methods.length > 0 ? 'gorilla' : router.framework;
  return receiver !== 'http' && (routed === 'gorilla' || routed === 'chi') ? routed : 'net-http';
}

/** Go 1.22's "GET /orders/{id}" puts the verb in the pattern; only net/http's ServeMux reads it. */
function verbInPattern(declared: string): { verb: string; path: string } | null {
  const match = METHOD_PREFIX.exec(declared);
  return match ? { verb: match[1] ?? '', path: match[2] ?? '' } : null;
}

/** HandleFunc and Handle on net/http's ServeMux, a gorilla router or a chi router. */
function handleCall(router: Router, line: Line): RouteDef[] {
  const match = HANDLE.exec(line.code);
  if (!match) return [];
  const [, receiver = '', declared = ''] = match;
  const inPattern = verbInPattern(declared);
  if (inPattern) return [handler('net-http', inPattern.verb, line.number)(inPattern.path)];
  const methods = gorillaMethods(line);
  const framework = handleFramework(router, receiver, methods);
  const pattern =
    framework === 'net-http' ? declared : joinRoute(prefixOf(router, receiver), declared);
  return (methods.length > 0 ? methods : ['ANY']).map((method) =>
    handler(framework, method, line.number)(pattern),
  );
}

/** Records a group or a Route block declared on this line; true when the line declared one. */
function declareScope(router: Router, line: Line, delta: number): boolean {
  const scope = SCOPE.exec(line.code);
  if (scope) {
    const [, parent = '', path = '', inner = ''] = scope;
    const prefix = joinRoute(prefixOf(router, parent), path);
    router.scopes.push({ name: inner, prefix, depth: router.depth + delta });
    return true;
  }
  const group = GROUP.exec(line.code);
  if (!group) return false;
  const [, name = '', parent = '', path = ''] = group;
  router.groups.set(name, joinRoute(prefixOf(router, parent), path));
  return true;
}

function visit(router: Router, line: Line, delta: number): RouteDef[] {
  while ((router.scopes.at(-1)?.depth ?? -1) > router.depth) router.scopes.pop();
  if (declareScope(router, line, delta)) return [];
  const first = methodFirst(router, line);
  if (first.length > 0) return first;
  const verb = verbCall(router, line);
  return verb.length > 0 ? verb : handleCall(router, line);
}

/** Handlers registered in comment-free Go source; imports are string literals, so they are kept. */
export function goServerRoutes({ code, bare }: MaskedSource): RouteDef[] {
  const framework = IMPORTS.find(([pattern]) => pattern.test(code))?.[1] ?? '';
  const router: Router = { framework, groups: new Map(), scopes: [], depth: 0 };
  const codeLines = code.split('\n');
  const bareLines = bare.split('\n');
  return codeLines.flatMap((lineCode, i) => {
    const delta = braceDelta(bareLines[i] ?? '');
    const line = { code: lineCode, next: codeLines[i + 1] ?? '', number: i + 1 };
    const routes = visit(router, line, delta);
    router.depth += delta;
    return routes;
  });
}
