/**
 * Outgoing HTTP calls through Spring's RestTemplate and WebClient (RestClient and WebTestClient
 * share WebClient's fluent shape). The pattern is the URL literal as written, placeholders kept; in
 * a `baseUrl + "/orders"` concatenation the literal part is what the call is found by.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import { matchLines } from '../../core/text/lines.ts';

const REST_TEMPLATE =
  /\b(\w+)\s*\.\s*(getForObject|getForEntity|postForObject|postForEntity|postForLocation|patchForObject|put|delete|exchange)(?:<[^<>()]*>)?\(\s*(?:[\w.]+\s*\+\s*)?"((?:[^"\\\n]|\\.)*)"(?:\s*,\s*HttpMethod\.([A-Z]+))?/g;
const WEB_CLIENT =
  /\.(?:(get|post|put|delete|patch|head|options)\(\s*\)|method\(\s*HttpMethod\.([A-Z]+)\s*\))\s*\.uri\(\s*(?:[\w.]+\s*\+\s*)?"((?:[^"\\\n]|\\.)*)"/g;
/** RestTemplate's verbs by method name; `exchange` takes its verb from an HttpMethod argument. */
const TEMPLATE_VERBS: ReadonlyMap<string, string> = new Map([
  ['getForObject', 'GET'],
  ['getForEntity', 'GET'],
  ['postForObject', 'POST'],
  ['postForEntity', 'POST'],
  ['postForLocation', 'POST'],
  ['patchForObject', 'PATCH'],
  ['put', 'PUT'],
  ['delete', 'DELETE'],
]);
/** put, delete and exchange are common method names, so their receiver must look like a template. */
const DISTINCT_NAMES = /For/;
const TEMPLATE_RECEIVER = /rest|template/i;

function restTemplateCalls(code: string): RouteDef[] {
  return matchLines(code, REST_TEMPLATE).flatMap((match): RouteDef[] => {
    const [, receiver = '', name = '', url = '', exchangeVerb] = match.groups;
    if (!DISTINCT_NAMES.test(name) && !TEMPLATE_RECEIVER.test(receiver)) return [];
    const method = TEMPLATE_VERBS.get(name) ?? exchangeVerb ?? 'ANY';
    return [
      {
        kind: 'client',
        role: 'caller',
        method,
        pattern: url,
        line: match.line,
        framework: 'resttemplate',
      },
    ];
  });
}

function webClientCalls(code: string): RouteDef[] {
  return matchLines(code, WEB_CLIENT).map((match): RouteDef => {
    const [text = '', verb, methodArgument, url = ''] = match.groups;
    const beforeUri = text.slice(0, text.lastIndexOf('.uri('));
    return {
      kind: 'client',
      role: 'caller',
      method: (verb ?? methodArgument ?? 'ANY').toUpperCase(),
      pattern: url,
      line: match.line + beforeUri.split('\n').length - 1,
      framework: 'webclient',
    };
  });
}

/** RestTemplate and WebClient calls in comment-free source (literals intact). */
export function httpClientCalls(code: string): RouteDef[] {
  return [...restTemplateCalls(code), ...webClientCalls(code)];
}
