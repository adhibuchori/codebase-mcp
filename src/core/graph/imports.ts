/**
 * Import statements from graph query captures, in one shape for both styles:
 * - `import com.acme.Foo;` → local Foo, imported Foo, source com.acme
 * - `import com.acme.*;` → local *, imported *, source com.acme (Kotlin: the statement ends in `*`)
 * - `import { a as b } from './m'` → local b, imported a, source ./m
 * - `import X from './m'` → imported default; `import * as api from './m'` → imported *
 */
import type { ImportFact, RawCapture } from '../model/graph.types.ts';
import { lastSegment } from './type-text.ts';

type Captures = ReadonlyMap<string, RawCapture>;

function qualifiedImport(path: string, found: Captures): ImportFact {
  if (found.get('import.statement')?.text.trim().endsWith('*'))
    return { local: '*', imported: '*', source: path };
  const name = lastSegment(path);
  return {
    local: name,
    imported: name,
    source: path.slice(0, Math.max(0, path.length - name.length - 1)),
  };
}

function moduleImport(source: string, found: Captures): ImportFact | null {
  const name = found.get('import.name')?.text;
  if (name) return { local: found.get('import.alias')?.text ?? name, imported: name, source };
  const fallback = found.get('import.default')?.text;
  if (fallback) return { local: fallback, imported: 'default', source };
  const namespace = found.get('import.namespace')?.text;
  return namespace ? { local: namespace, imported: '*', source } : null;
}

/** The import a match describes, or null when it is not an import. */
export function importOf(found: Captures): ImportFact | null {
  const qualified = found.get('import.qualified')?.text;
  if (qualified) return qualifiedImport(qualified, found);
  const wildcard = found.get('import.wildcard')?.text;
  if (wildcard) return { local: '*', imported: '*', source: wildcard };
  const source = found.get('import.source')?.text;
  return source ? moduleImport(source, found) : null;
}

/** The import that brings `local` into the file, ignoring wildcards. */
export function importNamed(imports: readonly ImportFact[], local: string): ImportFact | undefined {
  return imports.find((fact) => fact.local === local && fact.local !== '*');
}
