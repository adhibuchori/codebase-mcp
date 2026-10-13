import type { KnipConfig } from 'knip';

/**
 * Dead-code gate (`bun run check:dead-code`); the rule is .claude/rules/typescript/dead-code.md.
 * The server entry (`bun src/index.ts`) is found through package.json; every entry below is reached
 * by something Knip cannot follow, and says what.
 */
const config: KnipConfig = {
  entry: [
    /* The indexer worker: started by URL from src/adapters/runtime/worker-pool.ts. */
    'src/indexer/worker-entry.ts',
    /* Developer and CI scripts, run by path from package.json and the gates. */
    'scripts/**/*.ts',
    /* Claude Code hooks, run by path from .claude/settings.json. */
    '.claude/hooks/*.ts',
  ],
  project: ['src/**/*.ts', 'scripts/**/*.ts', '.claude/hooks/*.ts'],
  /* Exports used only inside their own file are reported too: drop `export` from them. */
  ignoreExportsUsedInFile: false,
};

export default config;
