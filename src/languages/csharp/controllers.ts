/**
 * ASP.NET Core attribute routing: a controller's [Route("api/[controller]")] prefix joined to its
 * actions' [HttpGet("{id}")], [HttpPost] and [Route("x")] templates, with the [controller] and
 * [action] tokens filled in and "/" or "~/" templates escaping the prefix. A prefix applies only
 * inside its own class's braces. Refit interfaces ([Get("/users/{id}")]) are outgoing calls.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import { joinRoute } from '../../core/routes/route-match.ts';
import { braceDelta, closingBracket, type MaskedSource } from './syntax.ts';

/** One attribute: its name and its template, `null` when it has none. */
interface Attribute {
  readonly name: string;
  readonly template: string | null;
  readonly line: number;
}

interface Controller {
  /** The [controller] token: the class name without its "Controller" suffix. */
  readonly token: string;
  readonly prefixes: readonly string[];
  /** Brace depth of the class body; the class ends when the depth drops below it. */
  readonly depth: number;
}

/** One line in both copies, and its 1-based number. */
interface Line {
  readonly code: string;
  readonly bare: string;
  readonly number: number;
}

interface Scan {
  depth: number;
  readonly controllers: Controller[];
  pending: Attribute[];
  awaiting: Omit<Controller, 'depth'> | null;
  readonly routes: RouteDef[];
}

const ATTRIBUTE = /(?:^|,)\s*([\w.]+)\s*(?:\(\s*(?:template:\s*)?"([^"]*)")?/g;
const CLASS = /\bclass\s+(\w+)/;
const METHOD_NAME = /\b(\w+)(?:\s*<[^<>()]*>)?\s*\(/;
const VERBS: ReadonlyMap<string, string> = new Map([
  ['HttpGet', 'GET'],
  ['HttpPost', 'POST'],
  ['HttpPut', 'PUT'],
  ['HttpDelete', 'DELETE'],
  ['HttpPatch', 'PATCH'],
  ['HttpHead', 'HEAD'],
  ['HttpOptions', 'OPTIONS'],
]);
const REFIT_VERBS = new Set(['Get', 'Post', 'Put', 'Delete', 'Patch', 'Head', 'Options']);

const leadingSpaces = (text: string): number => text.length - text.trimStart().length;

/** The attributes in a line's leading `[...]` sections, and the offset where the rest begins. */
function leadingAttributes(line: Line): { found: Attribute[]; rest: number } {
  const found: Attribute[] = [];
  let at = leadingSpaces(line.bare);
  let close = line.bare.charAt(at) === '[' ? closingBracket(line.bare, at) : -1;
  while (close !== -1) {
    for (const match of line.code.slice(at + 1, close).matchAll(ATTRIBUTE)) {
      const qualified = match[1] ?? '';
      const name = qualified.slice(qualified.lastIndexOf('.') + 1);
      found.push({ name, template: match[2] ?? null, line: line.number });
    }
    at = close + 1 + leadingSpaces(line.bare.slice(close + 1));
    close = line.bare.charAt(at) === '[' ? closingBracket(line.bare, at) : -1;
  }
  return { found, rest: at };
}

/** "api/[controller]" + "{id}"; a template starting with "/" or "~/" ignores the prefix. */
function combine(prefix: string, template: string): string {
  return /^~?\//.test(template)
    ? joinRoute('', template.replace(/^~/, ''))
    : joinRoute(prefix, template);
}

function actionRoutes(scan: Scan, attributes: readonly Attribute[], action: string): RouteDef[] {
  const controller = scan.controllers.at(-1) ?? { token: '', prefixes: [''], depth: 0 };
  const templates = attributes.filter((a) => a.name === 'Route').map((a) => a.template ?? '');
  const verbs = attributes.filter((a) => VERBS.has(a.name));
  const served =
    verbs.length > 0 ? verbs : attributes.filter((a) => a.name === 'Route').slice(0, 1);
  return served.flatMap((attribute) => {
    const own = VERBS.has(attribute.name) ? attribute.template : null;
    const method = VERBS.get(attribute.name) ?? 'ANY';
    const paths = own === null ? (templates.length > 0 ? templates : ['']) : [own];
    return controller.prefixes.flatMap((prefix) =>
      paths.map((path): RouteDef => ({
        kind: 'http',
        role: 'handler',
        method,
        pattern: combine(prefix, path)
          .replaceAll(/\[controller\]/gi, controller.token)
          .replaceAll(/\[action\]/gi, action),
        line: attribute.line,
        framework: 'aspnet',
      })),
    );
  });
}

/** Refit: [Get("/users/{id}")] on an interface method is a call the service makes. */
function refitCalls(attributes: readonly Attribute[]): RouteDef[] {
  return attributes
    .filter((attribute) => REFIT_VERBS.has(attribute.name) && attribute.template !== null)
    .map((attribute) => ({
      kind: 'client',
      role: 'caller',
      method: attribute.name.toUpperCase(),
      pattern: attribute.template ?? '',
      line: attribute.line,
      framework: 'refit',
    }));
}

/** A declaration after attributes: a class opens a controller, anything else is an action. */
function readDeclaration(scan: Scan, declaration: string): void {
  const type = CLASS.exec(declaration);
  if (type) {
    const name = type[1] ?? '';
    const templates = scan.pending.filter((a) => a.name === 'Route').map((a) => a.template ?? '');
    scan.awaiting = {
      token: name.replace(/Controller$/, ''),
      prefixes: templates.length > 0 ? templates : [''],
    };
  } else if (scan.pending.length > 0) {
    const action = METHOD_NAME.exec(declaration)?.[1] ?? '';
    scan.routes.push(...actionRoutes(scan, scan.pending, action), ...refitCalls(scan.pending));
  }
  scan.pending = [];
}

function visit(scan: Scan, line: Line): void {
  while ((scan.controllers.at(-1)?.depth ?? -1) > scan.depth) scan.controllers.pop();
  const { found, rest } = leadingAttributes(line);
  scan.pending.push(...found);
  if (line.bare.slice(rest).trim()) readDeclaration(scan, line.code.slice(rest));
  const delta = braceDelta(line.bare);
  if (scan.awaiting && delta > 0) {
    scan.controllers.push({ ...scan.awaiting, depth: scan.depth + delta });
    scan.awaiting = null;
  } else if (scan.awaiting && line.bare.includes(';')) {
    scan.awaiting = null;
  }
  scan.depth += delta;
}

/** Attribute-routed controller actions and Refit calls in masked C# source. */
export function controllerRoutes(source: MaskedSource): RouteDef[] {
  const scan: Scan = { depth: 0, controllers: [], pending: [], awaiting: null, routes: [] };
  const bareLines = source.bare.split('\n');
  source.code.split('\n').forEach((code, i) => {
    visit(scan, { code, bare: bareLines[i] ?? '', number: i + 1 });
  });
  return scan.routes;
}
