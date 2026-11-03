/**
 * Where a callee can live, so a callees answer never asks every repo about every call. A typed use
 * goes to the repos that define its type (its own repo first, and only that one when the type is
 * there); a module use stays in its repo, or goes to the repo its package is named after. Answers
 * are cached per scope for one callees answer.
 */
import { packageName } from '../core/graph/modules.ts';
import { lastSegment } from '../core/graph/type-text.ts';
import type { Repo } from '../core/model/domain.types.ts';
import type { ImportStyle, RefHit } from '../core/model/graph.types.ts';
import { qualifiedName } from '../core/symbols/symbol-tree.ts';
import { isTypeKind } from './call-graph.ts';
import type { EngineDeps } from './engine-deps.types.ts';

type RepoDeps = Pick<EngineDeps, 'index' | 'repos'>;

/** Does the repo define the type a scope names (by qualified name, or by simple name when open)? */
function definesType(deps: RepoDeps, repo: Repo, scope: string): boolean {
  const open = scope.startsWith('?') || !scope.includes('.');
  const type = scope.replace(/^\?/, '');
  const simple = lastSegment(type);
  return deps.index
    .findSymbols(repo, { name: simple, match: 'exact', kind: '', limit: 20 })
    .some((def) => {
      if (def.name !== simple || !isTypeKind(def.kind)) return false;
      if (open) return true;
      const pkg = deps.index.filePackage(repo, def.path) ?? '';
      return `${pkg ? `${pkg}.` : ''}${qualifiedName(def)}` === type;
    });
}

function typeRepos(deps: RepoDeps, scope: string, at: { own: Repo[]; others: Repo[] }): Repo[] {
  if (at.own.some((repo) => definesType(deps, repo, scope))) return at.own;
  return at.others.filter((repo) => definesType(deps, repo, scope));
}

function moduleRepos(scope: string, at: { own: Repo[]; others: Repo[] }): Repo[] {
  const spec = scope.split('#')[0] ?? '';
  if (spec === '' || spec.startsWith('.')) return at.own;
  return [...at.own, ...at.others.filter((repo) => repo.slug === packageName(spec))];
}

export type RepoFinder = (ref: RefHit, style: ImportStyle | null) => readonly Repo[];

export function calleeRepos(deps: RepoDeps, repos: readonly Repo[]): RepoFinder {
  const cache = new Map<string, readonly Repo[]>();
  return (ref, style) => {
    const key = `${ref.repo}\u0000${style ?? ''}\u0000${ref.scope}`;
    const known = cache.get(key);
    if (known) return known;
    const at = {
      own: repos.filter((repo) => repo.slug === ref.repo),
      others: repos.filter((repo) => repo.slug !== ref.repo),
    };
    const found =
      ref.scope === '' || style === null
        ? at.own
        : style === 'modules'
          ? moduleRepos(ref.scope, at)
          : typeRepos(deps, ref.scope, at);
    cache.set(key, found);
    return found;
  };
}
