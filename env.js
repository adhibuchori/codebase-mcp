import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Load .env from the project folder into process.env (existing variables win). Returns every key in the file. */
export function loadDotEnv(file = path.join(PROJECT_DIR, ".env")) {
  const keys = [];
  if (!fs.existsSync(file)) return keys;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    keys.push(m[1]);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
  return keys;
}
