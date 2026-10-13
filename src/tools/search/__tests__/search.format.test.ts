import { expect, test } from 'bun:test';
import type { FileGroup } from '../../../core/rank/group.ts';
import { renderSearch, type SearchView } from '../search.format.ts';
import type { RankedSearch } from '../search.service.ts';

function group(path: string): FileGroup {
  const match = { repo: 'orders', path, line: 3, column: 1, text: 'cancel();' };
  return { repo: 'orders', path, flags: 0, score: 1, shown: [{ match, score: 1 }], hidden: 0 };
}

function search(
  outcome: Partial<RankedSearch['outcome']>,
  groups: FileGroup[] = [group('a.ts')],
): RankedSearch {
  return {
    groups,
    repoCount: 1,
    symbols: new Map(),
    outcome: {
      matches: [],
      filesSearched: 1,
      truncated: false,
      timedOut: false,
      engines: ['ripgrep'],
      reposSearched: 1,
      viaIndex: 0,
      ...outcome,
    },
  };
}

const VIEW: SearchView = {
  query: 'cancel',
  offset: 0,
  limit: 15,
  perFile: 3,
  next: '',
  budget: 10_000,
};

test('a search that hit its limits says how to narrow it', () => {
  const text = renderSearch(search({ truncated: true, timedOut: true }), VIEW);
  expect(text).toContain('The search stopped at its match limit');
  expect(text).toContain('The search hit its time limit');
});

test('the file range shows only when the answer is one page of several', () => {
  const groups = [group('a.ts'), group('b.ts'), group('c.ts')];
  expect(renderSearch(search({}, groups), VIEW).split('\n')[0]).not.toContain(' · files ');
  const paged = renderSearch(search({}, groups), { ...VIEW, limit: 2, next: 'abc' });
  expect(paged.split('\n')[0]).toEndWith(' · files 1–2');
  expect(paged).toContain('cursor="abc"');
});

test('no matches suggests other modes', () => {
  expect(renderSearch(search({}, []), VIEW)).toContain('No matches. Try mode "word" or "regex"');
});
