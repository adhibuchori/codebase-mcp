/**
 * HTTP route matching across frameworks. Templates are written many ways ({id}, :id, <int:id>,
 * [id], *), and the URL in a log or ticket holds concrete values (/orders/123), so both sides are
 * cut into segments: a template parameter matches any value, and a concrete id matches a parameter.
 */
export type Segment =
  | { readonly kind: 'static'; readonly value: string }
  | { readonly kind: 'param' }
  | { readonly kind: 'rest' };

const PARAM = /^(\{[^}]*\}|:[\w-]+\??|<[^>]*>|\[[^\]]*\]|\$\{[^}]*\})$/;
const VALUE = /^(\d+|[0-9a-f]{8}-[0-9a-f-]{27}|[0-9a-f]{12,}|[A-Za-z0-9_-]{20,})$/i;

/** The path part of a URL or template, without scheme, host, query or fragment. */
export function pathOf(input: string): string {
  const text = input.trim().replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i, '');
  const withoutHost = text.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '').replace(/^\$\{[^}]*\}/, '');
  return withoutHost.split(/[?#]/)[0] ?? '';
}

export function routeSegments(input: string): Segment[] {
  return pathOf(input)
    .split('/')
    .filter(Boolean)
    .map((part): Segment => {
      if (part === '*' || part === '**' || part.startsWith('{*') || part.startsWith('*'))
        return { kind: 'rest' };
      if (PARAM.test(part) || VALUE.test(part)) return { kind: 'param' };
      return { kind: 'static', value: part.toLowerCase() };
    });
}

function segmentsMatch(query: readonly Segment[], template: readonly Segment[]): boolean {
  if (template.at(-1)?.kind === 'rest') {
    if (query.length < template.length - 1) return false;
  } else if (query.length !== template.length) return false;
  return template.every((part, i) => {
    const asked = query[i];
    if (part.kind !== 'static' || !asked) return true;
    return asked.kind === 'param' || (asked.kind === 'static' && asked.value === part.value);
  });
}

/**
 * 0 for no match, otherwise higher is better: 100 for an exact match, less when a gateway prefix
 * (/api, /v1) sits in front of the service's own route, or the service has a context path.
 */
export function matchRoute(query: string, template: string): number {
  const asked = routeSegments(query);
  const declared = routeSegments(template);
  if (declared.length === 0 || asked.length === 0) return 0;
  const statics = declared.filter((part) => part.kind === 'static').length;
  if (segmentsMatch(asked, declared)) return 100 + statics;
  for (let drop = 1; drop <= 2; drop++) {
    if (segmentsMatch(asked.slice(drop), declared)) return 60 + statics - drop;
    const shorter = declared.slice(drop);
    if (shorter.some((part) => part.kind === 'static') && segmentsMatch(asked, shorter))
      return 50 + statics - drop;
  }
  return 0;
}

/** Joins a controller prefix and a method path: ("/api/orders", "{id}") → "/api/orders/{id}". */
export function joinRoute(prefix: string, path: string): string {
  const joined = `${prefix}/${path}`.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
  return joined.startsWith('/') ? joined : `/${joined}`;
}
