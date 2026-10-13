/** Input fields several tools share, with one description each so the model reads them the same way. */
import { z } from 'zod';

export const reposField = z
  .array(z.string())
  .max(100)
  .optional()
  .describe('Repo names to limit the search to (from list_repos). Omit to search every repo.');

export const groupField = z
  .string()
  .optional()
  .describe('Only repos in this group (see list_repos).');

export const cursorField = z
  .string()
  .optional()
  .describe('Cursor from a previous answer, to get the next page of the same request.');

export const limitField = (fallback: number, max: number) =>
  z
    .number()
    .int()
    .min(1)
    .max(max)
    .default(fallback)
    .describe(`How many results to show (default ${fallback}).`);
