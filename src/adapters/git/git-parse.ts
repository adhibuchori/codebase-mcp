/** Parsers for the git output formats the reader asks for. Pure functions over strings. */
import { blockedReason } from '../../core/security/path-rules.ts';
import type { BlameLine, CommitSummary } from '../../ports/git.ts';

export const LOG_FORMAT = '--format=%h%x1f%ad%x1f%an%x1f%s';
const FIELD = '\u001f';

export function parseCommitLine(line: string): CommitSummary | null {
  const [sha, date, author, ...subject] = line.split(FIELD);
  if (!sha || !date) return null;
  return { sha, date, author: author ?? '', subject: subject.join(FIELD) };
}

export function parseLog(stdout: string): CommitSummary[] {
  return stdout.split('\n').flatMap((line) => parseCommitLine(line) ?? []);
}

interface BlameCommit {
  author: string;
  date: string;
  summary: string;
  time: number;
}

/** The author's calendar day, in the author's own time zone, as `git log --date=short` prints it. */
function authorDate(epochSeconds: number, tz: string): string {
  const match = /^([+-])(\d{2})(\d{2})$/.exec(tz);
  const offset = match
    ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 3600 + Number(match[3]) * 60)
    : 0;
  return new Date((epochSeconds + offset) * 1000).toISOString().slice(0, 10);
}

function readBlameHeader(line: string): { sha: string; final: number } | null {
  const match = /^([0-9a-f]{40}) \d+ (\d+)/.exec(line);
  return match?.[1] && match[2] ? { sha: match[1], final: Number(match[2]) } : null;
}

function applyBlameKey(commit: BlameCommit, line: string): void {
  if (line.startsWith('author ')) commit.author = line.slice(7);
  else if (line.startsWith('author-time ')) {
    commit.time = Number(line.slice(12));
    commit.date = authorDate(commit.time, '+0000');
  } else if (line.startsWith('author-tz ')) commit.date = authorDate(commit.time, line.slice(10));
  else if (line.startsWith('summary ')) commit.summary = line.slice(8);
}

/** `git blame --porcelain`: details of each commit appear once, then every line names its commit. */
export function parseBlame(stdout: string): BlameLine[] {
  const commits = new Map<string, BlameCommit>();
  const lines: BlameLine[] = [];
  let current: { sha: string; final: number } | null = null;
  for (const raw of stdout.split('\n')) {
    const header = readBlameHeader(raw);
    if (header) {
      current = header;
      if (!commits.has(header.sha))
        commits.set(header.sha, { author: '', date: '', summary: '', time: 0 });
    } else if (current && raw.startsWith('\t')) {
      const commit = commits.get(current.sha) ?? { author: '', date: '', summary: '', time: 0 };
      lines.push({
        line: current.final,
        sha: current.sha.slice(0, 8),
        author: commit.author,
        date: commit.date,
        summary: commit.summary,
        text: raw.slice(1),
      });
    } else if (current) {
      applyBlameKey(
        commits.get(current.sha) ?? { author: '', date: '', summary: '', time: 0 },
        raw,
      );
    }
  }
  return lines;
}

const DIFF_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;

function isSensitiveDiff(header: RegExpExecArray, extra: readonly RegExp[]): boolean {
  return (
    blockedReason(header[1] ?? '', extra) !== '' || blockedReason(header[2] ?? '', extra) !== ''
  );
}

/** Diff lines with the body of every sensitive file's section replaced by a note. */
function hideSensitive(lines: readonly string[], extra: readonly RegExp[]): string[] {
  const patch: string[] = [];
  let hidden = false;
  for (const line of lines) {
    const diff = DIFF_HEADER.exec(line);
    if (diff) hidden = isSensitiveDiff(diff, extra);
    if (diff) patch.push(hidden ? `${line}\n(diff of a sensitive file hidden)` : line);
    else if (!hidden) patch.push(line);
  }
  return patch;
}

/** Splits `git show --stat --patch` output and hides the diff of every sensitive file. */
export function splitShow(
  stdout: string,
  extra: readonly RegExp[],
): { header: string; stat: string; patch: string[] } {
  const lines = stdout.split('\n');
  const firstDiff = lines.findIndex((line) => line.startsWith('diff --git '));
  const head = firstDiff < 0 ? lines : lines.slice(0, firstDiff);
  const patch = firstDiff < 0 ? [] : hideSensitive(lines.slice(firstDiff), extra);
  return { header: head[0] ?? '', stat: head.slice(1).join('\n').trim(), patch };
}
