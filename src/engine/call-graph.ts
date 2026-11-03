/**
 * Callers across repos: every use of the target's name from the index, judged against the target
 * by src/core/graph/judge.ts. Exact matches come first, then likely ones, then matches by name only;
 * test files after source within each group.
 */
import { judgeUse, type GraphTarget, type Verdict } from '../core/graph/judge.ts';
import type { Repo, SymbolHit } from '../core/model/domain.types.ts';
import type { Confidence, ImportStyle, RefHit, RefKind } from '../core/model/graph.types.ts';
import { classifyPath, FLAG_TEST } from '../core/rank/classify.ts';
import { qualifiedName } from '../core/symbols/symbol-tree.ts';
import type { EngineDeps } from './engine-deps.types.ts';

type GraphDeps = Pick<EngineDeps, 'index' | 'languages' | 'repos'>;

export interface GraphEdge extends Verdict {
  readonly ref: RefHit;
}

const RANK: Readonly<Record<Confidence, number>> = { exact: 0, likely: 1, name: 2 };
const TYPE_KINDS = new Set(['class', 'interface', 'enum', 'record', 'struct', 'type', 'trait']);
const PER_REPO = 2000;

export const isTypeKind = (kind: string): boolean => TYPE_KINDS.has(kind);

/** Qualified supertypes a type declares in its own file (one level). */
export function supertypesOf(
  deps: Pick<EngineDeps, 'index'>,
  at: { repo: Repo; path: string },
  type: string,
): ReadonlySet<string> {
  const relations = deps.index
    .refsFrom(at.repo, at.path, type)
    .filter((ref) => (ref.kind === 'extends' || ref.kind === 'implements') && ref.scope !== '');
  return new Set(relations.map((ref) => ref.scope));
}

/** How the language of a file names other files, or null when it has no graph query. */
export function styleOf(deps: Pick<EngineDeps, 'languages'>, path: string): ImportStyle | null {
  return deps.languages.forPath(path)?.graph?.imports ?? null;
}

export function graphTarget(deps: GraphDeps, hit: SymbolHit): GraphTarget {
  const style = styleOf(deps, hit.path);
  const container = isTypeKind(hit.kind) ? qualifiedName(hit) : hit.container;
  const base = { repo: hit.repo, path: hit.path, container, style };
  const repo = deps.repos.get(hit.repo);
  if (style === 'modules' || style === null || !repo || !container)
    return { ...base, owner: '', supertypes: new Set<string>() };
  const pkg = style === 'packages' ? packageOf(deps, repo, hit.path) : '';
  const supertypes = supertypesOf(deps, { repo, path: hit.path }, container);
  return { ...base, owner: pkg ? `${pkg}.${container}` : container, supertypes };
}

function packageOf(deps: Pick<EngineDeps, 'index'>, repo: Repo, path: string): string {
  return deps.index.filePackage(repo, path) ?? '';
}

const isTest = (path: string): number => classifyPath(path) & FLAG_TEST;

function byConfidence(a: GraphEdge, b: GraphEdge): number {
  return (
    RANK[a.confidence] - RANK[b.confidence] ||
    isTest(a.ref.path) - isTest(b.ref.path) ||
    `${a.ref.repo}/${a.ref.path}`.localeCompare(`${b.ref.repo}/${b.ref.path}`) ||
    a.ref.line - b.ref.line
  );
}

/** The supertypes of the class a use sits in, cached per class. */
function callerSupertypes(deps: GraphDeps, repo: Repo, cache: Map<string, ReadonlySet<string>>) {
  return (ref: RefHit): ReadonlySet<string> => {
    const type = ref.origin.slice(0, Math.max(0, ref.origin.lastIndexOf('.'))) || ref.origin;
    const key = `${ref.path}#${type}`;
    const known = cache.get(key) ?? supertypesOf(deps, { repo, path: ref.path }, type);
    cache.set(key, known);
    return known;
  };
}

export function callersOf(deps: GraphDeps, hit: SymbolHit, repos: readonly Repo[]): GraphEdge[] {
  const target = graphTarget(deps, hit);
  const kinds: RefKind[] = isTypeKind(hit.kind)
    ? ['new', 'render', 'extends', 'implements']
    : ['call', 'render'];
  const self = qualifiedName(hit);
  const edges = repos.flatMap((repo) => {
    const supertypes = callerSupertypes(deps, repo, new Map());
    return deps.index.refsNamed(repo, { name: hit.name, kinds, limit: PER_REPO }).flatMap((ref) => {
      if (ref.path === hit.path && ref.repo === hit.repo && ref.origin === self) return [];
      const style = styleOf(deps, ref.path);
      const verdict = judgeUse(target, { ref, style, supertypes: () => supertypes(ref) });
      return verdict ? [{ ...verdict, ref }] : [];
    });
  });
  return edges.toSorted(byConfidence);
}
