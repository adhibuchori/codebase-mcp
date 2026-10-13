/**
 * Turns raw definitions (from tree-sitter tags or regex fallbacks) into the symbol list the index
 * stores: duplicates folded, sorted by position, each with its enclosing container, and functions
 * inside a class reported as methods.
 */
import type { SymbolDef } from '../model/domain.types.ts';

export interface RawDefinition {
  readonly name: string;
  readonly kind: string;
  readonly line: number;
  readonly endLine: number;
  readonly signature: string;
}

const CONTAINER_KINDS = new Set([
  'class',
  'interface',
  'module',
  'object',
  'struct',
  'enum',
  'trait',
  'impl',
  'namespace',
  'type',
]);
const KIND_RANK: Readonly<Record<string, number>> = {
  method: 3,
  class: 3,
  interface: 3,
  function: 1,
};

/** Folds definitions reported twice for one position (a method also matched as a function). */
function dedupe(defs: readonly RawDefinition[]): RawDefinition[] {
  const best = new Map<string, RawDefinition>();
  for (const def of defs) {
    const key = `${def.line}\u0000${def.name}`;
    const seen = best.get(key);
    if (!seen || (KIND_RANK[def.kind] ?? 2) > (KIND_RANK[seen.kind] ?? 2)) best.set(key, def);
  }
  return [...best.values()];
}

interface OpenScope {
  readonly def: RawDefinition;
  readonly path: string;
}

/** The innermost still-open definition for a line, after closing the scopes that ended before it. */
function parentFor(open: OpenScope[], line: number): OpenScope | undefined {
  while (open.length > 0 && (open.at(-1)?.def.endLine ?? 0) < line) open.pop();
  return open.at(-1);
}

function kindIn(def: RawDefinition, parent: OpenScope | undefined): string {
  return def.kind === 'function' && parent && CONTAINER_KINDS.has(parent.def.kind)
    ? 'method'
    : def.kind;
}

export function buildSymbols(defs: readonly RawDefinition[]): SymbolDef[] {
  const sorted = dedupe(defs).toSorted((a, b) => a.line - b.line || b.endLine - a.endLine);
  const open: OpenScope[] = [];
  return sorted.map((def) => {
    const parent = parentFor(open, def.line);
    const container = parent?.path ?? '';
    if (def.endLine > def.line)
      open.push({ def, path: container ? `${container}.${def.name}` : def.name });
    const { name, line, endLine, signature } = def;
    return { name, kind: kindIn(def, parent), line, endLine, container, signature };
  });
}

/** The innermost symbol whose range holds the line, if any. */
export function enclosingSymbol(
  symbols: readonly SymbolDef[],
  line: number,
): SymbolDef | undefined {
  let found: SymbolDef | undefined;
  for (const symbol of symbols) {
    if (symbol.line > line) break;
    if (symbol.endLine >= line && (!found || symbol.line >= found.line)) found = symbol;
  }
  return found;
}

/** "Class.method" for display. */
export function qualifiedName(symbol: Pick<SymbolDef, 'container' | 'name'>): string {
  return symbol.container ? `${symbol.container}.${symbol.name}` : symbol.name;
}

/** The first line of a definition, trimmed and capped: what the outline shows. */
export function signatureOf(line: string, max = 140): string {
  const text = line.trim().replace(/\s*\{\s*$/, '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
