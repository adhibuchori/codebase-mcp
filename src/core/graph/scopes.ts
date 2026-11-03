/**
 * Index-time resolution: where a used name lives, as far as its own file can tell. Packages resolve
 * to qualified types through imports, the file's package and java.lang; modules resolve to the
 * import specifier the name came from; types (Swift) keep the type name. What stays open is
 * resolved, or not, at query time.
 */
import type { ImportFact, ImportStyle } from '../model/graph.types.ts';
import { typeOf, type Binding } from './bindings.ts';
import { importNamed } from './imports.ts';
import { lastSegment } from './type-text.ts';

export interface FileContext {
  readonly style: ImportStyle;
  readonly pkg: string;
  readonly imports: readonly ImportFact[];
  readonly bindings: readonly Binding[];
  /** Types and functions defined at the top level of this file. */
  readonly topLevel: ReadonlySet<string>;
}

/** Where a use sits: its definition, the class around it, and its line. */
export interface UseSite {
  readonly origin: string;
  readonly originClass: string;
  readonly line: number;
}

const JAVA_LANG = new Set(
  'Object String StringBuilder Integer Long Short Byte Double Float Boolean Character Math System Thread Runnable Iterable Comparable Enum Record Exception RuntimeException Error Throwable IllegalArgumentException IllegalStateException NullPointerException UnsupportedOperationException'.split(
    ' ',
  ),
);

/** `this` (Java, Kotlin, TypeScript) and `self` (Swift) name the own object. */
const SELF = new Set(['this', 'self', 'super']);

const join = (pkg: string, name: string): string => (pkg ? `${pkg}.${name}` : name);

function packageType(type: string, ctx: FileContext): string {
  const [first = '', ...rest] = type.split('.');
  if (rest.length > 0 && /^[a-z]/.test(first)) return type;
  const suffix = rest.length > 0 ? `.${rest.join('.')}` : '';
  const fact = importNamed(ctx.imports, first);
  if (fact) return `${join(fact.source, fact.imported)}${suffix}`;
  if (ctx.topLevel.has(first)) return join(ctx.pkg, type);
  if (JAVA_LANG.has(first)) return `java.lang.${type}`;
  if (ctx.imports.some((i) => i.imported === '*')) return `?${type}`;
  return join(ctx.pkg, type);
}

function moduleType(type: string, ctx: FileContext): string {
  const [first = '', ...rest] = type.split('.');
  const fact = importNamed(ctx.imports, first);
  if (fact?.imported === '*') return rest.length > 0 ? `${fact.source}#${lastSegment(type)}` : '';
  if (fact) return `${fact.source}#${fact.imported === 'default' ? first : fact.imported}`;
  return ctx.topLevel.has(first) && rest.length === 0 ? `#${first}` : '';
}

/** The scope of a type name used in this file. */
export function typeScope(type: string, ctx: FileContext): string {
  if (!type || ctx.style === 'types') return type;
  return ctx.style === 'packages' ? packageType(type, ctx) : moduleType(type, ctx);
}

function selfScope(site: UseSite, ctx: FileContext): string {
  if (!site.originClass) return '';
  return ctx.style === 'modules' ? `#${site.originClass}` : join(ctx.pkg, site.originClass);
}

/** An unbound receiver: a class (static call), a namespace or an imported object. */
function unboundScope(receiver: string, ctx: FileContext): string {
  if (ctx.style !== 'modules') return /^[A-Z]/.test(receiver) ? typeScope(receiver, ctx) : '';
  const fact = importNamed(ctx.imports, receiver);
  if (!fact) return ctx.topLevel.has(receiver) ? `#${receiver}` : '';
  if (fact.imported === '*' || fact.imported === 'default') return fact.source;
  return /^[A-Z]/.test(fact.imported) ? `${fact.source}#${fact.imported}` : fact.source;
}

/** The scope of the receiver of `receiver.name()`. */
export function receiverScope(receiver: string, site: UseSite, ctx: FileContext): string {
  if (SELF.has(receiver)) return selfScope(site, ctx);
  const field = /^(?:this|self)\./.test(receiver) ? receiver.slice(receiver.indexOf('.') + 1) : '';
  const name = field || receiver;
  if (name.includes('.')) return field ? '' : unboundScope(receiver, ctx);
  const query = { name, origin: site.origin, line: site.line, fieldsOnly: field !== '' };
  const declared = typeOf(ctx.bindings, query);
  if (declared) return typeScope(declared, ctx);
  return field ? '' : unboundScope(receiver, ctx);
}

/** A call without a receiver: a static or module import, the own class, or the own module. */
export function plainCallScope(
  name: string,
  site: UseSite,
  ctx: FileContext,
): { readonly name: string; readonly scope: string } {
  const fact = importNamed(ctx.imports, name);
  if (ctx.style !== 'modules') return { name, scope: fact ? fact.source : selfScope(site, ctx) };
  if (!fact) return { name, scope: '' };
  const imported = fact.imported === 'default' || fact.imported === '*' ? name : fact.imported;
  return { name: imported, scope: fact.source };
}
