/**
 * Outgoing HTTP calls through HttpClient: GetAsync, PostAsJsonAsync, GetFromJsonAsync and their
 * siblings, and `new HttpRequestMessage(HttpMethod.Post, "…")`. The pattern is the URL literal as
 * written, interpolation holes kept ($"api/orders/{id}" gives "api/orders/{id}").
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import { matchLines } from '../../core/text/lines.ts';

const HTTP_CALL =
  /\b(\w+)\.(Get|Post|Put|Patch|Delete)(Async|FromJsonAsync|AsJsonAsync|StringAsync|StreamAsync|ByteArrayAsync)(?:<[^()]*?>)?\(\s*\$?@?"([^"\n]*)"/g;
const REQUEST_MESSAGE = /\bnew\s+HttpRequestMessage\(\s*HttpMethod\.(\w+)\s*,\s*\$?@?"([^"\n]*)"/g;
/** GetAsync and GetStringAsync also exist on caches, whose keys rarely hold a "/". */
const CLIENT_RECEIVER = /http|client|api/i;

function caller(method: string, pattern: string, line: number): RouteDef {
  return { kind: 'client', role: 'caller', method, pattern, line, framework: 'httpclient' };
}

/** HttpClient calls in comment-free C# source (literals intact). */
export function httpClientCalls(code: string): RouteDef[] {
  const calls = matchLines(code, HTTP_CALL).flatMap((match) => {
    const [, receiver = '', verb = '', suffix = '', url = ''] = match.groups;
    const isClient = suffix.includes('Json') || url.includes('/') || CLIENT_RECEIVER.test(receiver);
    return isClient ? [caller(verb.toUpperCase(), url, match.line)] : [];
  });
  const messages = matchLines(code, REQUEST_MESSAGE).map((match) =>
    caller((match.groups[1] ?? '').toUpperCase(), match.groups[2] ?? '', match.line),
  );
  return [...calls, ...messages];
}
