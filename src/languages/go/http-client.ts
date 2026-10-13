/**
 * Outgoing HTTP calls in Go: net/http's helpers (`http.Get`, `client.Post`) and requests built with
 * `http.NewRequest` or `http.NewRequestWithContext`. The pattern is the URL literal as written; in a
 * `baseURL + "/orders"` concatenation the literal part is what the call is found by.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import { matchLines } from '../../core/text/lines.ts';

const HELPER = /\b(\w+)\.(Get|Post|Head|PostForm)\(\s*([\w.]+\s*\+\s*)?"([^"\n]*)"/g;
const NEW_REQUEST =
  /\bhttp\.NewRequest(?:WithContext\(\s*[\w.]+(?:\(\))?\s*,|\()\s*(?:"([A-Z]+)"|http\.Method(\w+))\s*,\s*(?:[\w.]+\s*\+\s*)?"([^"\n]*)"/g;
const ABSOLUTE_URL = /^https?:\/\//;
const CLIENT = /client/i;
const HELPER_VERBS: ReadonlyMap<string, string> = new Map([
  ['Get', 'GET'],
  ['Post', 'POST'],
  ['Head', 'HEAD'],
  ['PostForm', 'POST'],
]);

function caller(method: string, pattern: string, line: number): RouteDef {
  return { kind: 'client', role: 'caller', method, pattern, line, framework: 'net-http' };
}

/** `cache.Get("key")` is not a call: the receiver must be net/http or a client, or the URL absolute. */
function helperCalls(code: string): RouteDef[] {
  return matchLines(code, HELPER).flatMap((match) => {
    const [, receiver = '', helper = '', , url = ''] = match.groups;
    const isCall = receiver === 'http' || CLIENT.test(receiver) || ABSOLUTE_URL.test(url);
    return isCall ? [caller(HELPER_VERBS.get(helper) ?? 'GET', url, match.line)] : [];
  });
}

function builtRequests(code: string): RouteDef[] {
  return matchLines(code, NEW_REQUEST).map((match) => {
    const [, literal, constant, url = ''] = match.groups;
    return caller((literal ?? constant ?? 'GET').toUpperCase(), url, match.line);
  });
}

/** Outgoing calls in comment-free Go source (literals intact). */
export function goClientCalls(code: string): RouteDef[] {
  return [...helperCalls(code), ...builtRequests(code)];
}
