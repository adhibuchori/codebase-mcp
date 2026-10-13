/**
 * Outgoing HTTP calls from Python: requests and httpx (`requests.get(f"{BASE}/orders/{id}")`,
 * `httpx.AsyncClient().post(…)`, `requests.request("POST", url)`), and the usual session or client
 * variables of requests, httpx and aiohttp. The pattern is the URL literal as written, f-string
 * placeholders included; a literal that is not a URL or a path (a cache key) is no call.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import { argsOfCall, codeMatches, HASH_COMMENT, leadingString } from '../generic/source-text.ts';

const VERB_CALL =
  /\b(requests|httpx\.(?:Async)?Client\([^)\n]*\)|httpx|_?session|_?client|http_client)\.(get|post|put|delete|patch|head|options|request)\(/g;
const URL_LIKE = /^(?:\/|https?:|\{)/;
const LIBRARY_IMPORTS: readonly (readonly [RegExp, string])[] = [
  [/^\s*(?:from|import)\s+httpx\b/m, 'httpx'],
  [/^\s*(?:from|import)\s+aiohttp\b/m, 'aiohttp'],
];

/** The library a session or client variable belongs to, judged by the file's imports. */
function sessionLibrary(text: string): string {
  return LIBRARY_IMPORTS.find(([imported]) => imported.test(text))?.[1] ?? 'requests';
}

function libraryOf(receiver: string, sessions: string): string {
  if (receiver.startsWith('httpx')) return 'httpx';
  return receiver === 'requests' ? 'requests' : sessions;
}

/** `.request("POST", url)` names its method first; every other verb is its own method. */
function methodAndUrl(verb: string, args: string): { method: string; url: string | undefined } {
  if (verb !== 'request') return { method: verb.toUpperCase(), url: leadingString(args) };
  const method = (leadingString(args) ?? '').toUpperCase();
  return { method, url: leadingString(args.slice(args.indexOf(',') + 1)) };
}

export function pythonClientCalls(text: string): RouteDef[] {
  const sessions = sessionLibrary(text);
  return codeMatches(text, VERB_CALL, HASH_COMMENT).flatMap((match): RouteDef[] => {
    const [, receiver = '', verb = ''] = match.groups;
    const { method, url } = methodAndUrl(verb, argsOfCall(text, match));
    if (url === undefined || !URL_LIKE.test(url)) return [];
    const framework = libraryOf(receiver, sessions);
    return [{ kind: 'client', role: 'caller', method, pattern: url, line: match.line, framework }];
  });
}
