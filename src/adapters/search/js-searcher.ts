/**
 * TextSearcher in plain JavaScript: the fallback when ripgrep cannot run (for example a locked-down
 * laptop that blocks binaries in node_modules), and the verifier for index candidates. Files are read
 * concurrently, binary files are skipped, and the deadline is checked between files.
 */
import { mapLimit } from '../../core/async/map-limit.ts';
import type { Repo, SearchResult, TextMatch } from '../../core/model/domain.types.ts';
import { globToRegex } from '../../core/text/glob.ts';
import { looksBinary } from '../../core/text/lines.ts';
import type { FileSystem } from '../../ports/file-system.ts';
import type { Inventory, TextQuery, TextSearcher } from '../../ports/search.ts';
import { compileMatcher, type LineMatcher } from './matcher.ts';

export interface JsSearcherDeps {
  readonly fs: FileSystem;
  readonly inventory: Inventory;
  readonly maxFileBytes: number;
}

interface Run {
  readonly query: TextQuery;
  readonly matcher: LineMatcher;
  readonly matches: TextMatch[];
  searched: number;
  timedOut: boolean;
}

function searchText(run: Run, file: { repo: Repo; path: string }, text: string): void {
  let perFile = 0;
  const lines = text.split(/\r?\n/);
  for (
    let i = 0;
    i < lines.length && perFile < run.query.maxPerFile && run.matches.length < run.query.maxMatches;
    i++
  ) {
    const line = lines[i] ?? '';
    const column = run.matcher(line);
    if (column > 0) {
      run.matches.push({ repo: file.repo.slug, path: file.path, line: i + 1, column, text: line });
      perFile++;
    }
  }
}

async function searchFile(
  deps: JsSearcherDeps,
  run: Run,
  file: { repo: Repo; path: string },
): Promise<void> {
  if (run.matches.length >= run.query.maxMatches) return;
  if (Date.now() > run.query.deadline) {
    run.timedOut = true;
    return;
  }
  const absolute = `${file.repo.root}/${file.path}`;
  const stat = await deps.fs.stat(absolute);
  if (!stat?.isFile || stat.size > deps.maxFileBytes) return;
  if (looksBinary(await deps.fs.readHead(absolute, 8000))) return;
  run.searched++;
  searchText(run, file, await deps.fs.readText(absolute));
}

async function execute(
  deps: JsSearcherDeps,
  query: TextQuery,
  files: readonly { repo: Repo; path: string }[],
): Promise<SearchResult> {
  const run: Run = {
    query,
    matcher: compileMatcher(query),
    matches: [],
    searched: 0,
    timedOut: false,
  };
  const glob = query.pathGlob ? globToRegex(query.pathGlob) : null;
  const selected = glob ? files.filter((file) => glob.test(file.path)) : files;
  await mapLimit(selected, 16, (file) => searchFile(deps, run, file));
  const truncated = run.matches.length >= query.maxMatches;
  return {
    matches: run.matches,
    filesSearched: run.searched,
    truncated,
    timedOut: run.timedOut,
    engines: ['scan'],
  };
}

export function createJsSearcher(deps: JsSearcherDeps): TextSearcher {
  return {
    name: 'scan',
    scan: async (repos, query) => {
      const listed = await mapLimit(repos, 4, async (repo) =>
        (await deps.inventory.list(repo)).map((entry) => ({ repo, path: entry.path })),
      );
      return execute(deps, query, listed.flat());
    },
    verify: (candidates, query) => {
      const files = [...candidates].flatMap(([repo, paths]) =>
        paths.map((path) => ({ repo, path })),
      );
      return execute(deps, query, files);
    },
  };
}
