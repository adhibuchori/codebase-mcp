import { expect, test } from 'bun:test';
import { parseBlame, parseCommitLine, parseLog, splitShow } from '../git-parse.ts';

const SEP = '\u001f';

test('parseCommitLine and parseLog', () => {
  expect(parseCommitLine(`abc1234${SEP}2026-10-01${SEP}Jane${SEP}fix: a${SEP}b`)).toEqual({
    sha: 'abc1234',
    date: '2026-10-01',
    author: 'Jane',
    subject: `fix: a${SEP}b`,
  });
  expect(parseCommitLine('')).toBeNull();
  expect(parseCommitLine(`abc${SEP}2026-01-01`)).toEqual({
    sha: 'abc',
    date: '2026-01-01',
    author: '',
    subject: '',
  });
  expect(parseLog(`a${SEP}d${SEP}x${SEP}s\n\nb${SEP}e${SEP}y${SEP}t`).map((c) => c.sha)).toEqual([
    'a',
    'b',
  ]);
});

test('parseBlame keeps commit details that appear only once', () => {
  const sha = 'a'.repeat(40);
  const porcelain = [
    `${sha} 1 1 2`,
    'author Jane',
    'author-time 1760000000',
    'summary fix: x',
    'filename a.go',
    '\tline one',
    `${sha} 2 2`,
    '\tline two',
    'noise before a header',
  ].join('\n');
  const lines = parseBlame(porcelain);
  expect(lines.map((l) => [l.line, l.sha, l.author, l.summary, l.text])).toEqual([
    [1, 'aaaaaaaa', 'Jane', 'fix: x', 'line one'],
    [2, 'aaaaaaaa', 'Jane', 'fix: x', 'line two'],
  ]);
  expect(lines[0]?.date).toBe('2025-10-09');
  const western = parseBlame(
    [`${sha} 1 1 1`, 'author-time 1760000000', 'author-tz -1000', '\tx'].join('\n'),
  );
  expect(western[0]?.date).toBe('2025-10-08');
  expect(
    parseBlame([`${sha} 1 1 1`, 'author-time 1760000000', 'author-tz +0700', '\tx'].join('\n'))[0]
      ?.date,
  ).toBe('2025-10-09');
  expect(parseBlame('\torphan line')).toEqual([]);
});

test('splitShow separates header, stat and patch, and hides sensitive diffs', () => {
  const output = [
    `h${SEP}2026-01-01${SEP}J${SEP}s`,
    ' a.go | 2 +-',
    'diff --git a/a.go b/a.go',
    '+ok',
    'diff --git a/certs/x.pem b/certs/x.pem',
    '+secret body',
    'diff --git a/b.go b/b.go',
    '+fine',
  ].join('\n');
  const parts = splitShow(output, []);
  expect(parts.header).toBe(`h${SEP}2026-01-01${SEP}J${SEP}s`);
  expect(parts.stat).toBe('a.go | 2 +-');
  expect(parts.patch.join('\n')).toContain('+ok');
  expect(parts.patch.join('\n')).toContain('(diff of a sensitive file hidden)');
  expect(parts.patch.join('\n')).not.toContain('secret body');
  expect(parts.patch.join('\n')).toContain('+fine');
  expect(splitShow('only header', []).patch).toEqual([]);
});
