/**
 * codebase.config.json: which folders hold the repos, and the limits that keep answers small.
 * Machine-local (gitignored); codebase.config.example.json shows every field and
 * codebase.config.schema.json (generated from this file) gives editors completion. Secrets never
 * live here: the API key and tunnel tokens stay in .env.
 */
import { z } from 'zod';

const rootSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .describe(
        'A folder that holds repos, e.g. "~/work". Every git repo below it is found automatically.',
      ),
    maxDepth: z
      .number()
      .int()
      .min(0)
      .max(8)
      .default(3)
      .describe('How many folder levels below path to look for repos.'),
    exclude: z
      .array(z.string())
      .default([])
      .describe('Globs (relative to path) of folders to skip, e.g. "archive/**".'),
    group: z
      .string()
      .optional()
      .describe(
        'Fixed group for every repo found here; by default the first folder below path is the group.',
      ),
  })
  .strict();

const repoSchema = z
  .object({
    name: z.string().min(1).describe('Repo name shown to the assistant.'),
    path: z.string().min(1).describe('Folder of the repo.'),
    group: z.string().default('').describe('Optional group, e.g. the team or domain.'),
  })
  .strict();

const limitsSchema = z
  .object({
    maxResponseTokens: z
      .number()
      .int()
      .min(500)
      .max(50_000)
      .default(6000)
      .describe('Upper bound for one tool answer, in tokens (about 4 characters each).'),
    maxFileBytes: z
      .number()
      .int()
      .min(1024)
      .max(50 * 1024 * 1024)
      .default(1024 * 1024)
      .describe('Files larger than this are listed but never read, searched or indexed.'),
    searchTimeoutMs: z
      .number()
      .int()
      .min(1000)
      .max(120_000)
      .default(20_000)
      .describe('A search stops after this long and returns what it found.'),
    maxReadLines: z
      .number()
      .int()
      .min(20)
      .max(2000)
      .default(200)
      .describe('Most lines read_code returns in one call.'),
  })
  .strict();

const indexSchema = z
  .object({
    enabled: z
      .boolean()
      .default(true)
      .describe('Build and refresh the background index (recommended).'),
    dir: z
      .string()
      .default('.cache/index')
      .describe('Where the per-repo index shards live, relative to the project folder.'),
    refreshSeconds: z
      .number()
      .int()
      .min(5)
      .max(3600)
      .default(30)
      .describe('How often to check whether a repo changed (HEAD, git index).'),
    rescanMinutes: z
      .number()
      .int()
      .min(1)
      .max(1440)
      .default(10)
      .describe('How often to re-check every file for edits git has not seen yet.'),
  })
  .strict();

export const configSchema = z
  .object({
    $schema: z.string().optional(),
    roots: z.array(rootSchema).default([]).describe('Folders whose git repos are all served.'),
    repos: z.array(repoSchema).default([]).describe('Individual repos, in addition to the roots.'),
    exclude: z
      .array(z.string())
      .default([])
      .describe('Globs of files that are never searched or indexed (on top of .gitignore).'),
    blocked: z
      .array(z.string())
      .default([])
      .describe(
        'Extra regexes for file names that must never be read (on top of the built-in secret list).',
      ),
    logging: z
      .object({
        loggerNames: z
          .array(z.string())
          .default([])
          .describe('In-house logger names that mark a log statement, e.g. "AuditLog".'),
      })
      .strict()
      .prefault({}),
    limits: limitsSchema.prefault({}),
    index: indexSchema.prefault({}),
  })
  .strict();

export type AppConfig = z.output<typeof configSchema>;
export type RootConfig = z.output<typeof rootSchema>;
export type RepoConfig = z.output<typeof repoSchema>;

/** The JSON Schema editors use for codebase.config.json. */
export function configJsonSchema(): string {
  return `${JSON.stringify(z.toJSONSchema(configSchema, { io: 'input' }), null, 2)}\n`;
}
