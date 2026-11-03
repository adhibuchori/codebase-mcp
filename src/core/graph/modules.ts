/**
 * Module specifiers against repo files, for JavaScript and TypeScript. A relative specifier is
 * resolved exactly (with or without an extension or `/index`); an alias (`@/x`, `~/x`, `src/x`) or a
 * package name is matched by path suffix or repo name, which is a likely match, not a proven one.
 */
import type { Confidence } from '../model/graph.types.ts';

const EXTENSION = /\.(?:d\.)?[cm]?[jt]sx?$/;

export interface FileSpot {
  readonly repo: string;
  readonly path: string;
}

/** `src/a/index.tsx` → `src/a`, `src/a/b.ts` → `src/a/b`. */
export function moduleBase(path: string): string {
  return path.replace(EXTENSION, '').replace(/\/index$/, '');
}

/** A relative specifier joined to the importing file's folder; null when it climbs out of the repo. */
export function resolveRelative(spec: string, fromPath: string): string | null {
  const parts = fromPath.split('/').slice(0, -1);
  for (const segment of spec.split('/')) {
    if (segment === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else if (segment !== '.' && segment !== '') parts.push(segment);
  }
  return moduleBase(parts.join('/'));
}

/** `@/screens/home` → `screens/home`; `@acme/ui/button` → `ui/button`; `lodash` stays. */
function aliasTail(spec: string): string {
  return spec.replace(/^(?:[@~#][^/]*|src)\//, '');
}

/** The package an import names: `@acme/design-system/x` → `design-system`, `axios` → `axios`. */
export function packageName(spec: string): string {
  const parts = spec.split('/');
  return (spec.startsWith('@') ? parts[1] : parts[0]) ?? '';
}

/** How well `spec`, imported in `from`, names the module of `target`. */
export function moduleMatch(spec: string, from: FileSpot, target: FileSpot): Confidence | null {
  const base = moduleBase(target.path);
  if (spec.startsWith('.')) {
    const resolved = resolveRelative(spec, from.path);
    return from.repo === target.repo && resolved === base ? 'exact' : null;
  }
  const tail = aliasTail(spec);
  if (from.repo === target.repo && (base === tail || base.endsWith(`/${tail}`))) return 'likely';
  return from.repo !== target.repo && packageName(spec) === target.repo ? 'likely' : null;
}
