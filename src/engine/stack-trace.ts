/**
 * Maps the frames of a pasted stack trace to files in the repos. Frames are matched by the longest
 * path suffix (the build machine's prefix never matches), using the index's file-name lookup, so a
 * trace resolves across hundreds of repos without scanning them. Library and runtime frames are
 * counted, not resolved.
 */
import type { ParsedTrace, Repo, StackFrame } from '../core/model/domain.types.ts';
import { isLibraryFrame, pathSuffixes } from '../core/stack/frame-paths.ts';
import { baseName } from '../core/text/lines.ts';
import type { EngineDeps } from './engine-deps.types.ts';

interface ResolvedFrame {
  readonly frame: StackFrame;
  readonly repo: Repo;
  readonly path: string;
  /** Other files that matched equally well (same suffix length). */
  readonly alternatives: number;
}

export interface TraceReport {
  readonly trace: ParsedTrace;
  readonly resolved: readonly ResolvedFrame[];
  readonly libraryFrames: number;
  readonly unresolved: readonly StackFrame[];
}

interface Candidate {
  readonly repo: Repo;
  readonly path: string;
  readonly matched: number;
}

function matchedSegments(path: string, suffixes: readonly string[]): number {
  const hit = suffixes.find((suffix) => path === suffix || path.endsWith(`/${suffix}`));
  return hit ? hit.split('/').length : 0;
}

type Lookup = (repo: Repo, name: string) => Promise<readonly string[]>;

function createLookup(deps: EngineDeps): Lookup {
  const inventories = new Map<string, Promise<string[]>>();
  const listPaths = async (repo: Repo): Promise<string[]> =>
    (await deps.inventory.list(repo)).map((entry) => entry.path);
  return async (repo, name) => {
    const indexed = deps.index.pathsNamed(repo, name, 200);
    if (indexed) return indexed;
    const listing = inventories.get(repo.slug) ?? listPaths(repo);
    inventories.set(repo.slug, listing);
    const lower = name.toLowerCase();
    return (await listing).filter((path) => baseName(path).toLowerCase() === lower);
  };
}

async function locate(
  frame: StackFrame,
  repos: readonly Repo[],
  lookup: Lookup,
): Promise<ResolvedFrame | null> {
  const suffixes = pathSuffixes(frame);
  const name = suffixes.at(-1);
  if (!name) return null;
  const perRepo = await Promise.all(
    repos.map(async (repo) =>
      (await lookup(repo, name)).map((path) => ({
        repo,
        path,
        matched: matchedSegments(path, suffixes),
      })),
    ),
  );
  const candidates: Candidate[] = perRepo.flat().filter((candidate) => candidate.matched > 0);
  const best = candidates.toSorted(
    (a, b) => b.matched - a.matched || a.path.length - b.path.length,
  )[0];
  if (!best) return null;
  const alternatives = candidates.filter(
    (candidate) => candidate !== best && candidate.matched === best.matched,
  ).length;
  return { frame, repo: best.repo, path: best.path, alternatives };
}

export async function resolveTrace(
  deps: EngineDeps,
  trace: ParsedTrace,
  repos: readonly Repo[],
): Promise<TraceReport> {
  const lookup = createLookup(deps);
  const appFrames = trace.frames.filter(
    (frame) => !isLibraryFrame(frame) && (frame.pathHint || frame.file),
  );
  const unique = appFrames.filter(
    (frame, index) =>
      appFrames.findIndex((other) => other.raw.trim() === frame.raw.trim()) === index,
  );
  const located = await Promise.all(unique.map((frame) => locate(frame, repos, lookup)));
  return {
    trace,
    resolved: located.filter((entry): entry is ResolvedFrame => entry !== null),
    libraryFrames: trace.frames.length - appFrames.length,
    unresolved: unique.filter((_frame, index) => located[index] === null),
  };
}
