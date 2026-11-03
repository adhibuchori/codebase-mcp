/**
 * The call graph's vocabulary: what one file imports and which names it calls, renders, constructs
 * or inherits from, with the scope each name was resolved to at index time. Type-only.
 */

/**
 * How a language names code in another file: dotted packages (Java, Kotlin), module paths
 * (JavaScript, TypeScript), or bare type names visible across a module (Swift).
 */
export type ImportStyle = 'packages' | 'modules' | 'types';

export type RefKind = 'call' | 'new' | 'render' | 'extends' | 'implements';

/**
 * One use of a name in a file. `scope` says where the name lives, as far as the file alone can
 * tell:
 * - packages: the qualified type (`com.acme.PaymentClient`), or `?Type` when wildcard imports leave
 *   the package open;
 * - types: the type name (`PaymentsApi`);
 * - modules: the module specifier (`./clients/orders`), `spec#Type` for a method of an imported
 *   type, `#Type` for a type of this file;
 * - "" when unknown. With an empty `receiver` too, it is a plain call to a name of this file.
 */
export interface CodeRef {
  readonly kind: RefKind;
  readonly name: string;
  /** The receiver as written (`this.payments`, `api`), "" for a plain call. */
  readonly receiver: string;
  readonly scope: string;
  readonly line: number;
  /** "Class.method" around the use, "" at the top level. For a type relation, the type itself. */
  readonly origin: string;
}

/** `local` is the name the file uses; `imported` the exported one, `*` or `default`. */
export interface ImportFact {
  readonly local: string;
  readonly imported: string;
  /** The package (`com.acme`) or the module specifier (`./clients/orders`). */
  readonly source: string;
}

export interface FileGraph {
  /** The Java package, or "" for a module language. */
  readonly pkg: string;
  readonly imports: readonly ImportFact[];
  readonly refs: readonly CodeRef[];
}

export interface RefHit extends CodeRef {
  readonly repo: string;
  readonly path: string;
}

/** One capture of a graph query: its name (`call.name`), text and line. */
export interface RawCapture {
  readonly name: string;
  readonly text: string;
  readonly line: number;
}

/** The captures of one query match. */
export type RawMatch = readonly RawCapture[];

/** How sure a graph edge is: resolved by type or import, matched by a looser rule, or by name. */
export type Confidence = 'exact' | 'likely' | 'name';
