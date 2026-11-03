/** Text for the callers and callees modes of find_symbol: one line per edge, best first. */
import type { Confidence, RefHit } from '../../core/model/graph.types.ts';
import type { SymbolHit } from '../../core/model/domain.types.ts';
import { plural } from '../../core/output/trim.ts';
import { qualifiedName } from '../../core/symbols/symbol-tree.ts';
import type { GraphEdge } from '../../engine/call-graph.ts';
import type { Callee } from '../../engine/callees.ts';

const LABEL: Readonly<Record<Confidence, string>> = {
  exact: 'exact ',
  likely: 'likely',
  name: 'name  ',
};

export function location(hit: SymbolHit): string {
  const range = hit.endLine > hit.line ? `${hit.line}-${hit.endLine}` : String(hit.line);
  return `${hit.repo}/${hit.path}:${range}`;
}

/** `payments.refund` or `find`. */
function written(ref: RefHit): string {
  const name =
    ref.kind === 'new' ? `new ${ref.name}` : ref.kind === 'render' ? `<${ref.name}>` : ref.name;
  return ref.receiver ? `${ref.receiver}.${name}` : name;
}

function counts(edges: readonly { confidence: Confidence }[]): string {
  const parts = (['exact', 'likely', 'name'] as const)
    .map((level) => [level, edges.filter((e) => e.confidence === level).length] as const)
    .filter(([, count]) => count > 0)
    .map(([level, count]) => `${count} ${level}`);
  return parts.length > 0 ? parts.join(', ') : 'none found';
}

export function callerLines(hit: SymbolHit, edges: readonly GraphEdge[], limit: number): string[] {
  const header = `Callers of ${qualifiedName(hit)} (${location(hit)}): ${counts(edges)}`;
  const lines = edges.slice(0, limit).map((edge) => {
    const via = edge.via ? ` · via ${edge.via}` : '';
    const origin = edge.ref.origin ? ` · in ${edge.ref.origin}` : '';
    return `  ${LABEL[edge.confidence]}  ${edge.ref.repo}/${edge.ref.path}:${edge.ref.line}${origin} · ${written(edge.ref)}${via}`;
  });
  const more = edges.length > limit ? [`  … ${edges.length - limit} more (raise limit)`] : [];
  const note = edges.some((e) => e.confidence === 'name')
    ? ['  "name" = same name, receiver type unknown: check before relying on it.']
    : [];
  return [header, ...lines, ...more, ...note];
}

interface CalleeGroups {
  readonly resolved: string[];
  readonly outside: string[];
  readonly unresolved: string[];
}

function groupCallees(callees: readonly Callee[]): CalleeGroups {
  const groups: CalleeGroups = { resolved: [], outside: [], unresolved: [] };
  const seen = new Set<string>();
  for (const { ref, defs } of callees) {
    const best = defs[0];
    const key = best ? `${written(ref)}→${location(best.def)}` : written(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    if (best) {
      const via = best.via ? ` · via ${best.via}` : '';
      const others = defs.length > 1 ? ` (+${plural(defs.length - 1, 'other')})` : '';
      groups.resolved.push(
        `  ${ref.line} ${written(ref)} → ${LABEL[best.confidence]}  ${qualifiedName(best.def)} — ${location(best.def)}${via}${others}`,
      );
    } else if (ref.scope && !ref.scope.startsWith('?'))
      groups.outside.push(`${written(ref)} (${ref.scope})`);
    else groups.unresolved.push(written(ref));
  }
  return groups;
}

export function calleeLines(hit: SymbolHit, callees: readonly Callee[], limit: number): string[] {
  const groups = groupCallees(callees);
  const header = `${qualifiedName(hit)} (${location(hit)}) calls ${plural(groups.resolved.length, 'indexed definition')}`;
  const more =
    groups.resolved.length > limit
      ? [`  … ${groups.resolved.length - limit} more (raise limit)`]
      : [];
  const outside =
    groups.outside.length > 0
      ? [
          `  No source definition (a library, or generated code such as Lombok): ${groups.outside.slice(0, 15).join(', ')}`,
        ]
      : [];
  const unresolved =
    groups.unresolved.length > 0
      ? [`  Unresolved (receiver type unknown): ${groups.unresolved.slice(0, 15).join(', ')}`]
      : [];
  return [header, ...groups.resolved.slice(0, limit), ...more, ...outside, ...unresolved];
}
