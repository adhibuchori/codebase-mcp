/**
 * Query-time resolution: does this use reach this definition, and how sure is that? Packages and
 * types compare qualified (or bare) types, including a call through a supertype of the target's
 * class and an inherited call from a subclass; modules compare import specifiers with the target's
 * file. A plain call may reach a top-level function (Kotlin, Swift): likely. A use whose receiver
 * type is unknown matches by name only; a use resolved elsewhere does not match at all.
 */
import type { Confidence, ImportStyle, RefHit } from '../model/graph.types.ts';
import { moduleMatch } from './modules.ts';
import { lastSegment } from './type-text.ts';

export interface GraphTarget {
  readonly repo: string;
  readonly path: string;
  /** "Class" or "Outer.Inner" around the definition, "" at the top level. */
  readonly container: string;
  readonly style: ImportStyle | null;
  /** Packages: the qualified class ("com.acme.PaymentClient"); types: the class; else "". */
  readonly owner: string;
  /** Packages: qualified supertypes of the owner class. */
  readonly supertypes: ReadonlySet<string>;
}

export interface CallerSite {
  readonly ref: RefHit;
  readonly style: ImportStyle | null;
  /** Packages: qualified supertypes of the class the use sits in, read only when needed. */
  readonly supertypes: () => ReadonlySet<string>;
}

export interface Verdict {
  readonly confidence: Confidence;
  /** The supertype a call went through, or "inherited"; "" for a direct use. */
  readonly via: string;
}

const NAME: Verdict = { confidence: 'name', via: '' };
const direct = (confidence: Confidence): Verdict => ({ confidence, via: '' });
const SELF = new Set(['', 'this', 'super']);

/** The use names the target's class, a supertype of it, or a subclass calling an inherited method. */
function ownerVerdict(target: GraphTarget, site: CallerSite): Verdict | null {
  const { scope, receiver } = site.ref;
  if (scope === target.owner) return direct('exact');
  if (target.supertypes.has(scope)) return { confidence: 'exact', via: lastSegment(scope) };
  if (SELF.has(receiver) && scope && site.supertypes().has(target.owner))
    return { confidence: 'exact', via: 'inherited' };
  return null;
}

/** No owner match: a top-level function, a class behind a wildcard import, or a name only. */
function looseVerdict(target: GraphTarget, ref: RefHit): Verdict | null {
  const { scope, receiver } = ref;
  if (receiver === '' && target.container === '') return direct('likely');
  const open = scope.startsWith('?') ? scope.slice(1) : '';
  if (open && (open === target.container || target.container.endsWith(`.${open}`)))
    return direct('likely');
  return scope === '' && receiver !== '' ? NAME : null;
}

function packagesVerdict(target: GraphTarget, site: CallerSite): Verdict | null {
  const owned = ownerVerdict(target, site);
  if (!owned) return looseVerdict(target, site.ref);
  /* A bare type name (Swift) is only unique inside its own module, taken here as its repo. */
  return target.style === 'types' && site.ref.repo !== target.repo ? direct('likely') : owned;
}

function sameFile(target: GraphTarget, ref: RefHit): boolean {
  return ref.repo === target.repo && ref.path === target.path;
}

/** No scope: a plain call to a function of the same file, or an unknown receiver. */
function unscopedVerdict(target: GraphTarget, ref: RefHit): Verdict | null {
  if (ref.receiver !== '') return NAME;
  return sameFile(target, ref) && target.container === '' ? direct('exact') : null;
}

function modulesVerdict(target: GraphTarget, ref: RefHit): Verdict | null {
  const { scope } = ref;
  if (scope === '') return unscopedVerdict(target, ref);
  const [spec = '', type = ''] = scope.split('#');
  if (type !== '' ? type !== target.container : target.container !== '') return null;
  if (spec === '') return sameFile(target, ref) ? direct('exact') : null;
  const match = moduleMatch(spec, ref, target);
  return match ? direct(match) : null;
}

/** How a use relates to the target definition; null when it provably does not. */
export function judgeUse(target: GraphTarget, site: CallerSite): Verdict | null {
  if (site.style === null) return NAME;
  if (site.style !== target.style) return null;
  return site.style === 'modules'
    ? modulesVerdict(target, site.ref)
    : packagesVerdict(target, site);
}
