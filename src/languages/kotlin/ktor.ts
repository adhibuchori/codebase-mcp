/**
 * Ktor's routing DSL: `get("/x") { … }`, `post { … }` and `route("/prefix") { … }` blocks nested to
 * any depth. A block's prefix holds while the brace depth stays inside it, so sibling blocks never
 * share a prefix. Braces and calls inside comments and string literals are ignored.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import type { RouteExtractor } from '../../core/model/language-pack.types.ts';
import { joinRoute } from '../../core/routes/route-match.ts';
import { braceDelta, maskSource } from '../jvm/syntax.ts';

/** An open `route("/prefix") {` block and the brace depth of its body. */
interface Block {
  readonly prefix: string;
  readonly depth: number;
}

const VERB =
  /(?:^|[^.\w])(get|post|put|delete|patch|head|options)(?:\s*\(\s*"((?:[^"\\]|\\.)*)"\s*\))?\s*\{/;
const ROUTE = /(?:^|[^.\w])(route)\s*\(\s*"((?:[^"\\]|\\.)*)"\s*\)\s*\{/;

/** The match of `regex` in a code line, when its keyword is code rather than text in a literal. */
function callIn(regex: RegExp, code: string, bare: string): RegExpExecArray | null {
  const match = regex.exec(code);
  const keyword = match?.[1] ?? '';
  const at = (match?.index ?? 0) + (match?.[0].indexOf(keyword) ?? 0);
  return match && bare.startsWith(keyword, at) ? match : null;
}

/** The scan's state: the brace depth, the open route blocks and the routes found so far. */
interface Walk {
  depth: number;
  readonly blocks: Block[];
  readonly routes: RouteDef[];
}

/** One line in both copies: comments blanked (`code`), and literals blanked too (`bare`). */
interface Line {
  readonly code: string;
  readonly bare: string;
  readonly number: number;
}

function ktorRoute(verb: RegExpExecArray, prefix: string, line: number): RouteDef {
  const method = (verb[1] ?? '').toUpperCase();
  const pattern = joinRoute(prefix, verb[2] ?? '');
  return { kind: 'http', role: 'handler', method, pattern, line, framework: 'ktor' };
}

function visit(walk: Walk, line: Line): void {
  while ((walk.blocks.at(-1)?.depth ?? -1) > walk.depth) walk.blocks.pop();
  const prefix = walk.blocks.at(-1)?.prefix ?? '';
  const delta = braceDelta(line.bare);
  const verb = callIn(VERB, line.code, line.bare);
  if (verb) walk.routes.push(ktorRoute(verb, prefix, line.number));
  const route = callIn(ROUTE, line.code, line.bare);
  if (route && delta > 0) {
    walk.blocks.push({ prefix: joinRoute(prefix, route[2] ?? ''), depth: walk.depth + delta });
  }
  walk.depth += delta;
}

export const ktorRoutes: RouteExtractor = (text) => {
  const { code, bare } = maskSource(text);
  const bareLines = bare.split('\n');
  const walk: Walk = { depth: 0, blocks: [], routes: [] };
  code
    .split('\n')
    .forEach((line, i) => visit(walk, { code: line, bare: bareLines[i] ?? '', number: i + 1 }));
  return walk.routes;
};
