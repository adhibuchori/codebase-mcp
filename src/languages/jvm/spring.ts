/**
 * HTTP endpoints declared with JVM annotations: Spring MVC and WebFlux controllers, JAX-RS
 * resources, Spring Cloud OpenFeign, Feign and Retrofit clients, plus RestTemplate and WebClient
 * calls. A class-level prefix (@RequestMapping, @Path, @FeignClient(path = …)) applies only to the
 * methods inside that class's own braces, so every class in a file keeps its own prefix.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import type { RouteExtractor } from '../../core/model/language-pack.types.ts';
import { joinRoute } from '../../core/routes/route-match.ts';
import { matchLines } from '../../core/text/lines.ts';
import { httpClientCalls } from './http-clients.ts';
import {
  annotationsIn,
  attributeValues,
  maskSource,
  type Annotation,
  type MaskedSource,
} from './syntax.ts';

/** A class, interface or object, its body's brace indexes and the annotations placed on it. */
interface ClassScope {
  readonly open: number;
  readonly close: number;
  readonly annotations: readonly Annotation[];
}

/** How a route is recorded: a served endpoint, or a call made by a declarative client. */
interface Shape {
  readonly kind: RouteDef['kind'];
  readonly role: RouteDef['role'];
  readonly framework: string;
}

/** What a method inherits from its class: path prefixes, and the shape of its routes. */
interface Owner {
  readonly prefixes: readonly string[];
  readonly shape: Shape;
}

const SPRING: Shape = { kind: 'http', role: 'handler', framework: 'spring' };
const FEIGN: Shape = { kind: 'client', role: 'caller', framework: 'feign' };
const JAX_RS: Shape = { kind: 'http', role: 'handler', framework: 'jax-rs' };
const RETROFIT: Shape = { kind: 'client', role: 'caller', framework: 'retrofit' };

const DECLARATION = /\b(?:class|interface|object)[ \t]+[A-Za-z_]\w*/g;
const MODIFIERS_ONLY = /^[\s\w]*$/;
const WHITESPACE_ONLY = /^\s*$/;
const HTTP_METHOD = /\b(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE)\b/g;
const REQUEST_LINE = /^([A-Z]+)\s+(\S+)/;
const JAX_RS_VERBS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);
/** Spring's mapping annotations and their verb; "" means the verb comes from `method = …`. */
const MAPPINGS: ReadonlyMap<string, string> = new Map([
  ['GetMapping', 'GET'],
  ['PostMapping', 'POST'],
  ['PutMapping', 'PUT'],
  ['DeleteMapping', 'DELETE'],
  ['PatchMapping', 'PATCH'],
  ['RequestMapping', ''],
]);
/** Annotations further than this from a class keyword are not that class's annotations. */
const MAX_GAP = 300;

const declaresRoute = (annotation: Annotation): boolean =>
  MAPPINGS.has(annotation.name) ||
  JAX_RS_VERBS.has(annotation.name) ||
  annotation.name === 'RequestLine';
const orRoot = (paths: readonly string[]): readonly string[] => (paths.length > 0 ? paths : ['']);
const joinAll = (prefixes: readonly string[], paths: readonly string[]): string[] =>
  prefixes.flatMap((prefix) => paths.map((path) => joinRoute(prefix, path)));

/** A factory for the routes one annotation declares, one per pattern. */
function shaped(shape: Shape, method: string, line: number): (pattern: string) => RouteDef {
  return (pattern) => ({
    kind: shape.kind,
    role: shape.role,
    method,
    pattern,
    line,
    framework: shape.framework,
  });
}

/** Annotations grouped by the declaration they annotate: only whitespace separates a group. */
function runsOf(source: MaskedSource, annotations: readonly Annotation[]): Annotation[][] {
  const runs: Annotation[][] = [];
  annotations.forEach((annotation, i) => {
    const previous = annotations[i - 1];
    const run = runs.at(-1);
    const gap = previous ? source.bare.slice(previous.end, annotation.start) : '';
    if (run && previous && WHITESPACE_ONLY.test(gap)) run.push(annotation);
    else runs.push([annotation]);
  });
  return runs;
}

/** True when only modifiers (public, data, open…) stand between a run and a class keyword. */
function annotates(source: MaskedSource, run: readonly Annotation[], keyword: number): boolean {
  const end = run.at(-1)?.end ?? keyword + 1;
  if (end > keyword || keyword - end > MAX_GAP) return false;
  return MODIFIERS_ONLY.test(source.bare.slice(end, keyword));
}

function classesIn(source: MaskedSource, runs: readonly Annotation[][]): ClassScope[] {
  return matchLines(source.bare, DECLARATION).map((declaration) => {
    const open = source.bare.indexOf('{', declaration.index);
    const run = runs.find((candidate) => annotates(source, candidate, declaration.index));
    return {
      open,
      close: source.closers.get(open) ?? -1,
      annotations: run ?? [],
    };
  });
}

/** The innermost class whose braces hold `index`: nested classes are declared later. */
function ownerAt(classes: readonly ClassScope[], index: number): Owner {
  const scope = classes.findLast((entry) => entry.open < index && index < entry.close);
  const annotations = scope?.annotations ?? [];
  const feign = annotations.find((annotation) => annotation.name === 'FeignClient');
  const mapping = annotations.find((a) => a.name === 'RequestMapping' || a.name === 'Path');
  const base = feign ? (attributeValues(feign.args, ['path'])[0] ?? '') : '';
  const paths = mapping ? attributeValues(mapping.args, ['value', 'path']) : [];
  return { prefixes: joinAll([base], orRoot(paths)), shape: feign ? FEIGN : SPRING };
}

function requestMethods(annotation: Annotation): string[] {
  const methods = attributeValues(annotation.args, ['method']).join(' ');
  const found = [...methods.matchAll(HTTP_METHOD)].map((match) => match[0]);
  return found.length > 0 ? found : ['ANY'];
}

/** @GetMapping, @PostMapping… and @RequestMapping on a method, in a controller or a Feign client. */
function springMapping(annotation: Annotation, owner: Owner): RouteDef[] {
  const verb = MAPPINGS.get(annotation.name);
  if (verb === undefined) return [];
  const methods = verb ? [verb] : requestMethods(annotation);
  const patterns = joinAll(
    owner.prefixes,
    orRoot(attributeValues(annotation.args, ['value', 'path'])),
  );
  return methods.flatMap((method) => patterns.map(shaped(owner.shape, method, annotation.line)));
}

/** JAX-RS (@GET with an optional @Path) or Retrofit (@GET("users/{id}") on an interface method). */
function verbAnnotation(
  annotation: Annotation,
  run: readonly Annotation[],
  owner: Owner,
): RouteDef[] {
  if (!JAX_RS_VERBS.has(annotation.name)) return [];
  if (annotation.args.length > 0) {
    const urls = attributeValues(annotation.args, ['value']);
    return urls.map(shaped(RETROFIT, annotation.name, annotation.line));
  }
  const path = run.find((other) => other.name === 'Path');
  const paths = orRoot(path ? attributeValues(path.args, ['value']) : []);
  return joinAll(owner.prefixes, paths).map(shaped(JAX_RS, annotation.name, annotation.line));
}

/** Feign's own contract: @RequestLine("GET /repos/{owner}/{repo}"). */
function requestLine(annotation: Annotation): RouteDef[] {
  if (annotation.name !== 'RequestLine') return [];
  const parts = REQUEST_LINE.exec(attributeValues(annotation.args, ['value'])[0] ?? '');
  if (!parts) return [];
  const [, method = '', pattern = ''] = parts;
  return [shaped(FEIGN, method, annotation.line)(pattern)];
}

function methodRoutes(run: readonly Annotation[], owner: Owner): RouteDef[] {
  return run.flatMap((annotation) => [
    ...springMapping(annotation, owner),
    ...verbAnnotation(annotation, run, owner),
    ...requestLine(annotation),
  ]);
}

export const springRoutes: RouteExtractor = (text) => {
  const source = maskSource(text);
  const runs = runsOf(source, annotationsIn(source));
  const classes = classesIn(source, runs);
  const onClasses = new Set<readonly Annotation[]>(classes.map((scope) => scope.annotations));
  const declared = runs
    .filter((run) => !onClasses.has(run) && run.some(declaresRoute))
    .flatMap((run) => methodRoutes(run, ownerAt(classes, run[0]?.start ?? 0)));
  return [...declared, ...httpClientCalls(source.code)].toSorted((a, b) => a.line - b.line);
};
