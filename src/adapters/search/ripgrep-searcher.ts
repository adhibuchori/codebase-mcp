/**
 * TextSearcher on ripgrep: one process per repo (each is multi-threaded), run a few at a time,
 * stopped as soon as enough matches arrived or the deadline passed. Results are filtered by name
 * once more, so a secret file can never slip through a glob gap.
 */
import { chunk, mapLimit } from '../../core/async/map-limit.ts';
import { ToolError } from '../../core/errors/tool-error.ts';
import type { Repo, SearchResult, TextMatch } from '../../core/model/domain.types.ts';
import { isHiddenPath } from '../../core/security/path-rules.ts';
import { globToRegex } from '../../core/text/glob.ts';
import type { TextQuery, TextSearcher } from '../../ports/search.ts';
import { spawnCollect } from '../process/spawn-collect.ts';
import { ripgrepArgs } from './rg-args.ts';
import { parseRgLine } from './rg-json.ts';

export interface RipgrepDeps {
  readonly rgPath: string;
  readonly maxFileBytes: number;
  readonly exclude: readonly string[];
  readonly blocked: readonly RegExp[];
}

interface Run {
  readonly query: TextQuery;
  readonly matches: TextMatch[];
  readonly files: Set<string>;
  timedOut: boolean;
}

async function runRg(
  deps: RipgrepDeps,
  run: Run,
  target: { repo: Repo; paths: readonly string[] },
): Promise<void> {
  const remaining = run.query.deadline - Date.now();
  if (remaining <= 0 || run.matches.length >= run.query.maxMatches) {
    run.timedOut ||= remaining <= 0;
    return;
  }
  const args = [
    ...ripgrepArgs(run.query, deps),
    ...(target.paths.length > 0 ? ['--', ...target.paths] : []),
  ];
  const result = await spawnCollect(deps.rgPath, args, {
    cwd: target.repo.root,
    maxBytes: 64 * 1024 * 1024,
    timeoutMs: remaining,
    onLine: (line) => {
      const match = parseRgLine(line);
      if (match && !isHiddenPath(match.path, deps.blocked)) {
        run.files.add(`${target.repo.slug}/${match.path}`);
        run.matches.push({ repo: target.repo.slug, ...match });
      }
      return run.matches.length < run.query.maxMatches;
    },
  });
  run.timedOut ||= result.timedOut;
  if (result.code === 2 && result.stderr.includes('regex parse error')) {
    const reason = /^error: (.+)$/m.exec(result.stderr)?.[1] ?? 'the pattern does not parse';
    throw new ToolError(
      `Invalid regex: ${reason}.`,
      'Escape special characters, or use mode "literal".',
    );
  }
}

function finish(run: Run): SearchResult {
  const truncated = run.matches.length >= run.query.maxMatches;
  return {
    matches: run.matches.slice(0, run.query.maxMatches),
    filesSearched: run.files.size,
    truncated,
    timedOut: run.timedOut,
    engines: ['ripgrep'],
  };
}

/** Splits a file list so one command line stays well under Windows' 32,767-character limit. */
function batches(paths: readonly string[]): string[][] {
  const out: string[][] = [];
  for (const group of chunk(paths, 400)) {
    let current: string[] = [];
    let length = 0;
    for (const path of group) {
      if (length + path.length > 20_000 && current.length > 0) {
        out.push(current);
        [current, length] = [[], 0];
      }
      current.push(path);
      length += path.length + 1;
    }
    if (current.length > 0) out.push(current);
  }
  return out;
}

export function createRipgrepSearcher(deps: RipgrepDeps): TextSearcher {
  return {
    name: 'ripgrep',
    scan: async (repos, query) => {
      const run: Run = { query, matches: [], files: new Set(), timedOut: false };
      await mapLimit(repos, 4, (repo) => runRg(deps, run, { repo, paths: [] }));
      return finish(run);
    },
    verify: async (candidates, query) => {
      const run: Run = { query, matches: [], files: new Set(), timedOut: false };
      /* ripgrep applies --glob only while walking, never to files named on the command line. */
      const glob = query.pathGlob ? globToRegex(query.pathGlob) : null;
      const targets = [...candidates].flatMap(([repo, paths]) =>
        batches(glob ? paths.filter((path) => glob.test(path)) : paths).map((group) => ({
          repo,
          paths: group,
        })),
      );
      await mapLimit(targets, 4, (target) => runRg(deps, run, target));
      return finish(run);
    },
  };
}
