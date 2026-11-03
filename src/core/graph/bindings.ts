/**
 * Declared types of fields, parameters and variables, so a call on `payments` or `this.payments`
 * resolves to the type it was declared with. Scopes come from the symbol tree: a binding belongs to
 * the innermost definition around it, and a lookup walks from the call's definition outwards.
 */
import type { RawCapture } from '../model/graph.types.ts';
import { bareType } from './type-text.ts';

export interface Binding {
  readonly name: string;
  readonly type: string;
  /** "Class.method" the declaration sits in, "" at the top level. */
  readonly scope: string;
  readonly line: number;
}

export interface BindingQuery {
  readonly name: string;
  readonly origin: string;
  readonly line: number;
  /** `this.x`: skip the method's own parameters and locals. */
  readonly fieldsOnly: boolean;
}

/** The binding a match declares; an explicit type wins over the constructed one (`var x = new T()`). */
export function bindingOf(
  found: ReadonlyMap<string, RawCapture>,
  scopeAt: (line: number) => string,
): Binding | null {
  const name = found.get('bind.name');
  if (!name) return null;
  const type =
    bareType(found.get('bind.type')?.text ?? '') || bareType(found.get('bind.value')?.text ?? '');
  return type ? { name: name.text, type, scope: scopeAt(name.line), line: name.line } : null;
}

/** "A.b.c" → ["A.b.c", "A.b", "A", ""]. */
function scopeChain(origin: string): string[] {
  const chain: string[] = [];
  for (
    let scope = origin;
    scope !== '';
    scope = scope.slice(0, Math.max(0, scope.lastIndexOf('.')))
  )
    chain.push(scope);
  return [...chain, ''];
}

/** The declared type of a name at a line, or "" when nothing in scope declares it. */
export function typeOf(bindings: readonly Binding[], query: BindingQuery): string {
  const chain = scopeChain(query.origin).slice(query.fieldsOnly ? 1 : 0);
  for (const scope of chain) {
    const declared = bindings.filter((b) => b.name === query.name && b.scope === scope);
    const before = declared.filter((b) => b.line <= query.line);
    const chosen = before.at(-1) ?? declared[0];
    if (chosen) return chosen.type;
  }
  return '';
}
