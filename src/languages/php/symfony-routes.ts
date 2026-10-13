/**
 * Symfony routes declared on controllers: PHP 8 attributes (`#[Route('/orders/{id}', methods:
 * ['GET'])]`) and docblock annotations (`@Route("/orders/{id}", methods={"GET"})`). A route on the
 * class itself is the prefix of the routes that follow it. Without `methods`, a route answers ANY.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import { withPrefix } from '../generic/route-scopes.ts';
import {
  argsOfCall,
  codeMatches,
  leadingString,
  PHP_COMMENT,
  quotedStrings,
} from '../generic/source-text.ts';

const ROUTE_ATTRIBUTE = /(?:#\[|@)Route\(/g;
const PATH_OPTION = /\bpath(?::|\s*=)\s*['"]([^'"]*)['"]/;
const METHODS_OPTION = /\bmethods(?::|\s*=)\s*[[{]([^\]}]*)[\]}]/;
/** Lines between a route and what it is placed on: blank, other attributes, docblock lines. */
const DECORATION = /^\s*(?:$|#\[|\*|\/\*\*|@)/;
const CLASS_LINE = /^[\w \t]*\bclass\s+\w/;

/** True when the declaration after the route at `index` is a class, not a method. */
function onClass(text: string, index: number): boolean {
  const following = text
    .slice(index, index + 800)
    .split('\n')
    .slice(1);
  const declaration = following.find((line) => !DECORATION.test(line));
  return CLASS_LINE.test(declaration ?? '');
}

function methodsOf(args: string): string[] {
  const methods = quotedStrings(METHODS_OPTION.exec(args)?.[1] ?? '').map((method) =>
    method.toUpperCase(),
  );
  return methods.length > 0 ? methods : ['ANY'];
}

export function symfonyRoutes(text: string): RouteDef[] {
  const routes: RouteDef[] = [];
  let prefix = '';
  for (const match of codeMatches(text, ROUTE_ATTRIBUTE, PHP_COMMENT)) {
    const args = argsOfCall(text, match);
    const path = leadingString(args) ?? PATH_OPTION.exec(args)?.[1] ?? '';
    if (onClass(text, match.index)) {
      prefix = path;
      continue;
    }
    const pattern = withPrefix(prefix, path);
    for (const method of methodsOf(args)) {
      routes.push({
        kind: 'http',
        role: 'handler',
        method,
        pattern,
        line: match.line,
        framework: 'symfony',
      });
    }
  }
  return routes;
}
