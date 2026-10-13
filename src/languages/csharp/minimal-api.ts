/**
 * ASP.NET Core minimal APIs: `app.MapGet("/orders/{id}", …)` and its siblings, with route groups
 * (`var orders = app.MapGroup("/api/orders")`, nested groups too) resolved per variable within the
 * file, in source order.
 */
import type { RouteDef } from '../../core/model/domain.types.ts';
import { joinRoute } from '../../core/routes/route-match.ts';
import { matchLines } from '../../core/text/lines.ts';

/** A group assignment (groups 1 to 3) or an endpoint mapping (groups 4 to 6). */
const MINIMAL =
  /\b(\w+)\s*=\s*(\w+)\.MapGroup\(\s*"([^"\n]*)"|\b(\w+)\.Map(Get|Post|Put|Delete|Patch|Methods)\(\s*"([^"\n]*)"/g;

/** Minimal API endpoints in comment-free C# source (literals intact). */
export function minimalApiRoutes(code: string): RouteDef[] {
  const groups = new Map<string, string>();
  return matchLines(code, MINIMAL).flatMap((match): RouteDef[] => {
    const [, group, parent = '', prefix = '', receiver = '', verb = '', path = ''] = match.groups;
    if (group) {
      groups.set(group, joinRoute(groups.get(parent) ?? '', prefix));
      return [];
    }
    return [
      {
        kind: 'http',
        role: 'handler',
        method: verb === 'Methods' ? 'ANY' : verb.toUpperCase(),
        pattern: joinRoute(groups.get(receiver) ?? '', path),
        line: match.line,
        framework: 'aspnet-minimal',
      },
    ];
  });
}
