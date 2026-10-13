/**
 * Parses the text of a .env file into key/value pairs. Only src/env.ts calls it, with the file the
 * user keeps next to the project; values already set in the environment win there, not here.
 */
const LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;

function unquote(value: string): string {
  const quoted =
    value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0];
  return quoted ? value.slice(1, -1) : value;
}

export function parseDotEnv(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue;
    const match = LINE.exec(line);
    if (match?.[1] !== undefined) values.set(match[1], unquote(match[2] ?? ''));
  }
  return values;
}
