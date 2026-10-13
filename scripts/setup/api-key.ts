/**
 * Makes sure the .env file holds a strong MCP_API_KEY: creates .env from .env.example when missing,
 * fills an empty or short key, and keeps a good one. Returns a note for the user; the key itself is
 * never printed, so it cannot end up in a terminal log or an assistant's context.
 */
import { randomBytes } from 'node:crypto';

export interface FileOps {
  readonly read: (path: string) => string;
  readonly write: (path: string, text: string) => void;
  readonly exists: (path: string) => boolean;
}

const KEY_LINE = /^MCP_API_KEY=(.*)$/m;

export function ensureApiKey(envPath: string, examplePath: string, files: FileOps): string {
  const text = files.exists(envPath)
    ? files.read(envPath)
    : files.exists(examplePath)
      ? files.read(examplePath)
      : '';
  const current =
    KEY_LINE.exec(text)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, '') ?? '';
  if (current.length >= 24) return 'MCP_API_KEY in .env is already set (kept as is).';
  const key = randomBytes(32).toString('hex');
  const updated = KEY_LINE.test(text)
    ? text.replace(KEY_LINE, `MCP_API_KEY=${key}`)
    : `${text}${text && !text.endsWith('\n') ? '\n' : ''}MCP_API_KEY=${key}\n`;
  files.write(envPath, updated);
  return 'Generated a new MCP_API_KEY in .env. Open .env to copy it into ClickUp (field "API key").';
}
