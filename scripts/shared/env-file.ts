/**
 * Loads the project's .env into process.env for the developer scripts (tunnel, check, setup,
 * doctor). Variables already set in the shell win. Returns every key the file defines, so a script
 * can keep them away from the programs it starts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDotEnv } from '../../src/config/dotenv.ts';

export const PROJECT_DIR = join(import.meta.dirname, '..', '..');

export function loadEnvFile(file = join(PROJECT_DIR, '.env')): string[] {
  if (!existsSync(file)) return [];
  const values = parseDotEnv(readFileSync(file, 'utf8'));
  for (const [key, value] of values) if (process.env[key] === undefined) process.env[key] = value;
  return [...values.keys()];
}
