/**
 * Path globs for user filters: `*` stays within a folder, `**` crosses folders, `?` is one
 * character and `{a,b}` is either. A pattern without a slash matches the file name anywhere.
 */
function translate(pattern: string): string {
  let out = '';
  let braces = 0;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i] ?? '';
    if (pattern.startsWith('**/', i)) {
      out += '(?:.*/)?';
      i += 2;
    } else if (pattern.startsWith('**', i)) {
      out += '.*';
      i += 1;
    } else {
      const piece = translateChar(char, braces);
      braces += piece.depth;
      out += piece.text;
    }
  }
  return out;
}

function translateChar(char: string, braces: number): { text: string; depth: number } {
  if (char === '*') return { text: '[^/]*', depth: 0 };
  if (char === '?') return { text: '[^/]', depth: 0 };
  if (char === '{') return { text: '(?:', depth: 1 };
  if (char === '}' && braces > 0) return { text: ')', depth: -1 };
  if (char === ',' && braces > 0) return { text: '|', depth: 0 };
  return { text: char.replace(/[.+^$()|[\]\\]/g, '\\$&'), depth: 0 };
}

/** Compiles a glob to a case-insensitive RegExp over repo-relative paths. */
export function globToRegex(pattern: string): RegExp {
  const clean = pattern.trim().replace(/^\.\//, '').replace(/^\/+/, '');
  const anywhere = !clean.includes('/');
  return new RegExp(`${anywhere ? '(^|/)' : '^'}${translate(clean)}$`, 'i');
}

/** True when the path matches at least one glob, or no glob was given. */
export function matchesAnyGlob(path: string, globs: readonly RegExp[]): boolean {
  return globs.length === 0 || globs.some((glob) => glob.test(path));
}
