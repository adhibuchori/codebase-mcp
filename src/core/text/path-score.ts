/**
 * Fuzzy path matching for find_files. Every word of the query must appear in the path; a word in
 * the file name, at the start of a segment, or in camelCase position counts more, and shorter,
 * shallower paths win ties. A single word with no substring hit falls back to a subsequence match
 * on the file name ("ordctl" finds OrderController.java).
 */
export function scorePath(path: string, query: string): number {
  const words = query
    .toLowerCase()
    .split(/[\s/]+/)
    .filter(Boolean);
  if (words.length === 0) return 0;
  const lower = path.toLowerCase();
  const base = lower.slice(lower.lastIndexOf('/') + 1);
  let score = 0;
  for (const word of words) {
    const at = lower.indexOf(word);
    if (at < 0) return words.length === 1 ? subsequenceScore(base, word) : 0;
    score += 10 + (base.includes(word) ? 20 : 0) + (at === 0 || lower[at - 1] === '/' ? 5 : 0);
  }
  const depth = path.split('/').length;
  return score + Math.max(0, 10 - depth) + Math.max(0, 5 - Math.floor(path.length / 40));
}

function subsequenceScore(base: string, word: string): number {
  let at = 0;
  for (const char of word) {
    at = base.indexOf(char, at);
    if (at < 0) return 0;
    at++;
  }
  return 5;
}
