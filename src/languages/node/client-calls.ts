/**
 * Outgoing HTTP calls from JavaScript and TypeScript: axios (`axios.get('/x')`, `axios({ method,
 * url })`, and instances made by `axios.create()`), fetch, got and ky. fetch, got and ky take
 * their method from a `method:` option of the same call, GET otherwise. The pattern is the URL
 * literal exactly as written, `${…}` placeholders included, since that is what a search finds.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import type { LineMatch } from '../../core/text/lines.ts';
import { argsOfCall, C_STYLE_COMMENT, codeMatches, leadingString } from '../generic/source-text.ts';

interface Call {
  readonly method: string;
  readonly url: string;
}

const LIBRARIES: readonly (readonly [string, string])[] = [
  ['axios', 'axios'],
  ['got', 'got'],
  ['ky', 'ky'],
  ['superagent', 'superagent'],
];
const INSTANCE_DECL =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(axios|got|ky)\.(?:create|extend)\(/g;
const VERB_CALL = /\b([A-Za-z_$][\w$]*)\.(get|post|put|delete|patch|head|options)(?:<[^>\n]*>)?\(/g;
const CONFIG_CALL = /\baxios(?:\.request)?\((?=\s*\{)/g;
const URL_CALL = /\b(fetch|got|ky)\(/g;
const URL_OPTION = /\burl:\s*(['"`][^'"`\n]*['"`])/;
const METHOD_OPTION = /\bmethod:\s*['"`](\w+)['"`]/;

const methodOption = (args: string): string =>
  (METHOD_OPTION.exec(args)?.[1] ?? 'GET').toUpperCase();

function caller(framework: string, match: LineMatch, call: Call): RouteDef {
  return {
    kind: 'client',
    role: 'caller',
    method: call.method,
    pattern: call.url,
    line: match.line,
    framework,
  };
}

/** HTTP clients created in the file (`const api = axios.create(…)`), by variable name. */
export function clientInstances(text: string): Map<string, string> {
  const declared = codeMatches(text, INSTANCE_DECL, C_STYLE_COMMENT);
  return new Map(
    declared.map((match): [string, string] => [match.groups[1] ?? '', match.groups[2] ?? '']),
  );
}

/** `axios.get('/orders')`, `api.post(`${base}/orders`)` on a known client or instance. */
function verbCalls(text: string, clients: ReadonlyMap<string, string>): RouteDef[] {
  return codeMatches(text, VERB_CALL, C_STYLE_COMMENT).flatMap((match): RouteDef[] => {
    const framework = clients.get(match.groups[1] ?? '');
    const url = framework === undefined ? undefined : leadingString(argsOfCall(text, match));
    if (framework === undefined || url === undefined) return [];
    return [caller(framework, match, { method: (match.groups[2] ?? '').toUpperCase(), url })];
  });
}

/** `axios({ method: 'post', url: '/orders' })` and `axios.request({ … })`. */
function configCalls(text: string): RouteDef[] {
  return codeMatches(text, CONFIG_CALL, C_STYLE_COMMENT).flatMap((match): RouteDef[] => {
    const args = argsOfCall(text, match);
    const url = leadingString(URL_OPTION.exec(args)?.[1] ?? '');
    return url === undefined ? [] : [caller('axios', match, { method: methodOption(args), url })];
  });
}

/** `fetch('/orders', { method: 'POST' })`, `got(url)` and `ky(url)`. */
function urlCalls(text: string): RouteDef[] {
  return codeMatches(text, URL_CALL, C_STYLE_COMMENT).flatMap((match): RouteDef[] => {
    const args = argsOfCall(text, match);
    const url = leadingString(args);
    if (url === undefined) return [];
    return [caller(match.groups[1] ?? '', match, { method: methodOption(args), url })];
  });
}

export function clientCalls(text: string): RouteDef[] {
  const clients = new Map([...LIBRARIES, ...clientInstances(text)]);
  return [...verbCalls(text, clients), ...configCalls(text), ...urlCalls(text)];
}
