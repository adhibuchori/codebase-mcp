# Changelog

All notable changes to codebase-mcp are listed here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). A **Breaking:** line marks a change
you have to act on. How a release is made: [RELEASING.md](RELEASING.md).

## [Unreleased]

## [2.1.1] - 2026-10-14

### Changed

- `bun run setup` asks for repos to add on lines of their own: one example per format (a folder, a
  name of your own with `name=folder`, several separated by `;`), then the answer after `> ` on a
  new line. It used to be a single line that packed every format into parentheses.

## [2.1.0] - 2026-10-14

### Added

- `bun run setup --repo <folder>` (repeatable, also `name=folder`) adds repos to `REPOS` in `.env`.
  It changes only that line, checks that each folder is a git repository, skips a folder that is
  already listed, and gives a taken name a numbered suffix.

### Changed

- `bun run setup` follows `REPOS`. When `REPOS` is set in `.env`, setup no longer asks for a folder
  or writes `codebase.config.json`. It shows the repos `REPOS` serves and offers to add more, so
  `.env` stays the one place that lists them. Without `REPOS` it finds repos under a folder, as
  before. The API key is now checked first, in both cases.

## [2.0.3] - 2026-10-14

### Fixed

- `REPOS` in `.env`, when set, now decides exactly which repos are served. The roots and repos of
  `codebase.config.json` are skipped; its other settings (limits, index, blocked) still apply. In
  2.0.2 `REPOS` was added to the config's repos, so a root left from setup kept serving repos that
  were not in `REPOS`. The start banner and `doctor` say `REPOS in .env (settings from …)`.
- `bun run setup` warns when `REPOS` is set, since the folders it writes are then skipped.

## [2.0.2] - 2026-10-14

### Fixed

- `REPOS` is added to the repos of `codebase.config.json` instead of being ignored once that file
  exists. Editing `REPOS` and restarting `bun start` now always changes what is served. A folder
  that a root also finds is served once, under its `REPOS` name. The start banner names both
  sources.
- Log lines are no longer red in the terminal. The logger wrote through `console.error`, which Bun
  paints red, so every `INFO` line looked like an error. It now writes to stderr directly.
- `bun run check` says why the server cannot be reached and stops there, instead of failing every
  MCP check with the same status:
  - a 403 from Cloudflare Access means the service token was refused;
  - a redirect to the Access login means no policy with the action "Service Auth" includes it;
  - 530 means the named tunnel is not connected, usually because `CF_TUNNEL_TOKEN` is missing and
    `bun tunnel` opened a temporary quick tunnel instead;
  - 502 means `bun start` is not running.
- `codebase.config.json.bak`, the copy `bun run setup` keeps, is gitignored like the config.

## [2.0.1] - 2026-10-14

### Fixed

- `LOG_LEVEL=debug` now logs more than `info`. Every search writes one `search plan` line: the route
  it took (index or direct scan) and why, the candidate files the index left, the repos it ruled out
  or scanned in full, the engines used, and the time spent. Every index run names its reason
  (`startup`, `rescan`, `git: <what changed>`, `requested`), and a run that found nothing to do is
  logged at `debug` only. The `indexed` line at `info` now carries the reason too. Before this,
  `debug` printed exactly what `info` did. The README explains how to read these lines.
- The `codebase.config.json` example in the README is now valid JSON. It held comments and trailing
  commas, which the server's `JSON.parse` refuses, so a copied example stopped the server at start.
  A table below it now explains each field.
- The README's source layout is a tree and lists every folder; `config/`, `composition/`, `cli/`,
  `testing/`, `assets/` and the entry files were missing.

## [2.0.0] - 2026-10-14

A rewrite for large multi-repo codebases: fast across hundreds of repos, small answers, and tools
built for debugging. Measured on 200 repos (1.8 GB): searches answer in under 0.4 s (p95), and a
typical answer is 100–1,500 tokens. v1 took 4.4 s per search over 27,000 files and up to 39,500
tokens per file read.

### Added

- `bun run setup` finds every git repo under the folders you name and writes `codebase.config.json`
  (with a JSON schema for editor completion), and creates a strong `MCP_API_KEY` in `.env` without
  printing it.
- `bun run doctor` checks:
  - the runtime and the API key;
  - the config and the repos it finds;
  - ripgrep, git, SQLite and the grammars;
  - the running server and the tunnel tool.
- `bun run index` builds every index and exits; `bun run stdio` serves MCP over stdin and stdout
  for Claude Code, Cursor and other local clients.
- A background index per repo (SQLite FTS5 trigram, about 21% of the source size), refreshed
  within 30 seconds of a commit, checkout or pull, and rebuilt per changed file only.
- A query planner: a broad search uses the index to pick candidate files, and ripgrep reads only
  those; a focused search runs ripgrep directly. Results are always read from disk.
- Symbols from tree-sitter grammars for Java, Kotlin, Scala, Go, C#, TypeScript, TSX, JavaScript,
  Python, PHP, Ruby, Rust, C, C++ and Elixir, plus line patterns for any other language.
- Language packs for HTTP routes, HTTP clients, gRPC and message topics in the main frameworks, and
  stack-trace parsers for the JVM, Go, .NET, Node, Python, PHP and Ruby.
- New tools:
  - `repo_overview`: the map of one repo.
  - `find_symbol`: definitions and references.
  - `triage_error`: stack trace, log line, error message or URL, mapped to code.
  - `find_endpoint`: HTTP route, gRPC method or topic, mapped to its handlers and callers.
- `list_repos` now shows each service's languages, frameworks, endpoints, topics, last commit and
  index state, and filters by name, group or language.
- Every answer has a token budget (`limits.maxResponseTokens`, 6,000 by default) and steps down in
  detail before cutting. Long result lists page with a cursor.
- Every answer is scrubbed of token-like values (API keys, JWTs, private keys, credentials in
  URLs).
- Request logs show the JSON-RPC method, the tool, the client's protocol version and name, the
  status and the time taken.
- Runs on Node.js 22.18+ as well as Bun, with no install scripts and nothing to compile, for
  locked-down Windows laptops. When the bundled ripgrep can't run, search falls back to a
  JavaScript scanner.
- `bun run eval` (20 debugging scenarios) and `bun run bench` (a scale benchmark over N copies of a
  corpus).
- Quality gates:
  - format and type-aware lint (oxfmt, oxlint);
  - TypeScript 7 strict;
  - 100% line and function coverage per file;
  - dead code (knip), comment style, folder shape, secrets (gitleaks);
  - the README pair and version sync.

  They run in a pre-commit hook and in CI on macOS, Windows and Ubuntu.

### Changed

- **Breaking:** `project_tree` is replaced by `repo_overview`, `read_file` by `read_code`, and
  `git_info` by `git_history`. Their arguments changed; see [docs/tools.md](docs/tools.md).
- **Breaking:** repos are configured in `codebase.config.json`. Run `bun run setup` once.
  `REPOS` in `.env` still works when there is no config file.
- **Breaking:** Node.js 22.18 or newer is required when running without Bun (v1 accepted 18).
- `search_code` searches every repo at once by default. It ranks definitions and whole-word hits
  first, and tests, generated and vendored files last, and groups hits by file with the enclosing
  function. It has `literal`, `word` and `regex` modes.
- `read_code` reads one function by name (`repo/path#Class.method`). For a large file it shows the
  outline first instead of the whole file.
- The server is TypeScript on Hono and the MCP SDK's Web-standard transport, laid out as core,
  ports, adapters, engine and tools. Express is gone.
- git runs with its system and global config ignored, along with fsmonitor and the pager.
  Revisions are validated, and `--end-of-options` and `--literal-pathspecs` are used.

### Fixed

- A regex that the JavaScript engine would take exponential time on is refused, instead of stalling
  the server.

## [1.0.0] - 2026-10-13

The single-file JavaScript server that ClickUp Brain used first.

### Added

- Six read-only tools: `list_repos`, `project_tree`, `read_file`, `search_code`, `find_files` and
  `git_info`.
- API-key auth (`Authorization: Bearer` or `X-API-Key`, compared in constant time), a per-IP rate
  limit, and blocking of `.env` files and other sensitive names.
- `bun start`, `bun tunnel` (Cloudflare on Mac, Pinggy on Windows) and `bun run check`.

[Unreleased]: https://github.com/adhibuchori/codebase-mcp/compare/v2.1.1...HEAD
[2.1.1]: https://github.com/adhibuchori/codebase-mcp/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/adhibuchori/codebase-mcp/compare/v2.0.3...v2.1.0
[2.0.3]: https://github.com/adhibuchori/codebase-mcp/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/adhibuchori/codebase-mcp/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/adhibuchori/codebase-mcp/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/adhibuchori/codebase-mcp/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/adhibuchori/codebase-mcp/releases/tag/v1.0.0
