# Tools

The tools codebase-mcp serves, with every argument and a real answer from the fixture repos in
`tests/fixtures/repos/`. Nine are read-only (`readOnlyHint: true`). The tenth,
[`switch_branch`](#switch_branch), is listed only when `ALLOW_BRANCH_SWITCH` turns it on.

Some rules hold for every tool:

- **Answers are plain text.** Each location is written once, as `repo/path:line`, which `read_code`
  accepts as is.
- **Every answer fits a budget.** The default is `limits.maxResponseTokens` = 6,000 tokens, about
  4 characters each. When an answer would not fit, detail steps down (fewer lines per file, then one
  line per file, then counts per repo) before anything is cut.
- **Long lists page.** The answer ends with `cursor="…"`. Repeat the call with the same arguments
  plus that cursor; a cursor from a different request is refused.
- **Errors say what to do next.** A wrong repo name suggests close names, and a bad symbol lists
  the symbols in the file. An invalid regex says why, so the model can retry.
- **`repos` and `group` narrow most tools.** `repos` takes repo names from `list_repos`, and
  `group` takes the folder group shown in brackets there. Omit both to cover every repo.

## list_repos

The catalog of services: one line each, grouped.

| Argument   | Default | Meaning                                                              |
| ---------- | ------- | -------------------------------------------------------------------- |
| `query`    | none    | Part of a repo or group name                                         |
| `group`    | none    | Only this group                                                      |
| `language` | none    | Only repos that use this language id (`java`, `go`, `typescript`, …) |
| `cursor`   | none    | Next page (60 repos per page)                                        |

```text
6 repos · index ready for 6 · search engine: ripgrep + index
[shop]
- orders-java  java 100% · spring-boot, spring-cloud-openfeign, spring-kafka · 10 files · 2 endpoints · 1 topic · 2026-10-13 "feat: import orders-java" · ready
- payments-go  go 100% · gin, kafka-go · 5 files · 2 endpoints · 1 topic · 2026-10-13 "feat: import payments-go" · ready
```

## repo_overview

A one-screen map of one repo.

| Argument | Default   | Meaning                   |
| -------- | --------- | ------------------------- |
| `repo`   | required  | Repo name                 |
| `path`   | repo root | A folder to zoom into     |
| `depth`  | 2         | Folder levels shown (1–4) |

It shows the languages, frameworks and last commit, the key files (build files, entrypoints,
Dockerfiles, API contracts), the endpoints and topics the repo declares, and its folders with file
counts, biggest first. Wide folders are collapsed.

## search_code

Text search across repos, ranked and grouped by file.

| Argument         | Default    | Meaning                                                      |
| ---------------- | ---------- | ------------------------------------------------------------ |
| `query`          | required   | The text. Case-insensitive unless it holds a capital letter. |
| `mode`           | `literal`  | `literal`, `word` (whole identifier) or `regex`              |
| `case_sensitive` | auto       | Force it on or off                                           |
| `repos`, `group` | every repo | Narrow the search                                            |
| `path`           | none       | Glob over paths: `src/**/*.ts`, `*.go`                       |
| `include_tests`  | `true`     | Tests are included but rank lower                            |
| `detail`         | `normal`   | Hits per file: `brief` 1, `normal` 3, `full` 8               |
| `limit`          | 15         | Files per page (1–50)                                        |
| `cursor`         | none       | Next page                                                    |

```text
"Order already cancelled": 1 match in 1 file across 1 repo (searched 6 repos, 6 through the index)
orders-java/src/main/java/com/acme/orders/service/OrderService.java
  29: throw new IllegalStateException("Order already cancelled");  · in OrderService.cancel
```

Ranking follows Zoekt:

- A line that defines the searched name scores highest, then whole-word hits, then partial ones.
- A hit in the file name adds to the score.
- Tests, generated and vendored files are divided by 5, and docs by 2.

Identical lines in many files are folded into one count. Lines are trimmed around the match.

## find_files

Fuzzy path search.

| Argument         | Default    | Meaning                                                             |
| ---------------- | ---------- | ------------------------------------------------------------------- |
| `query`          | required   | Words from the path, or an abbreviation of the file name (`ordctl`) |
| `repos`, `group` | every repo | Narrow the search                                                   |
| `limit`          | 20         | Results (1–100)                                                     |

Every word has to appear in the path. Hits in the file name rank first, then shorter paths.

## read_code

Reads code by reference.

| Argument  | Default  | Meaning                                                                                         |
| --------- | -------- | ----------------------------------------------------------------------------------------------- |
| `ref`     | required | `repo/path`, `repo/path:120`, `repo/path:120-180`, `repo/path#Name` or `repo/path#Class.method` |
| `mode`    | `auto`   | `auto`, `content` (always the text) or `outline`                                                |
| `context` | 25       | Lines on each side of a single-line reference                                                   |

What `auto` reads:

- **`#Name`:** exactly that definition.
- **`:line`:** the lines around it.
- **A range:** that range. At most `limits.maxReadLines` (200) lines are returned per call, and a
  `More:` line gives the next range.
- **A small file:** the whole file.
- **A large file:** its outline first, which is every definition with its line range:

```text
payments-go/internal/payment/handler.go · Go · 31 lines · outline (4 symbols)
struct Handler  L11-13
function func NewHandler(svc *Service) *Handler  L15-17
method func (h *Handler) Get(c *gin.Context)  L19-21
method func (h *Handler) Refund(c *gin.Context)  L23-31
Read one symbol: read_code "payments-go/internal/payment/handler.go#Handler", or a range: "payments-go/internal/payment/handler.go:1-31".
```

Binary files, files over `limits.maxFileBytes`, sensitive names, and paths that leave the repo
(`..`, absolute paths, symlinks out) are refused with a reason.

## find_symbol

Definitions by name, from the symbol index.

| Argument         | Default       | Meaning                                                                        |
| ---------------- | ------------- | ------------------------------------------------------------------------------ |
| `name`           | required      | The name, or part of it                                                        |
| `kind`           | any           | `class`, `interface`, `method`, `function`, `type`, `enum`, `struct`, `module` |
| `mode`           | `definitions` | `definitions`, or `references` for every whole-word use                        |
| `repos`, `group` | every repo    | Narrow the search                                                              |
| `limit`          | 20            | Results (1–100)                                                                |

The search tries exact names first, then prefixes, then substrings. Within one step, the order is:

1. names in the same case;
2. code before contracts (`.proto`, `.graphql`);
3. shorter names first.

```text
"Refund": 3 definitions
method Refund — payments-go/internal/payment/handler.go:23-31
    func (h *Handler) Refund(c *gin.Context)
method Refund — payments-go/internal/payment/service.go:19-25
    func (s *Service) Refund(id string) error
method PaymentClient.refund — orders-java/src/main/java/com/acme/orders/client/PaymentClient.java:9-10
    @PostMapping("/{id}/refund")
```

Repos whose index is not ready yet are named in the answer, never silently skipped.

## triage_error

The debugging entry point. Paste what you have.

| Argument         | Default    | Meaning                                                                 |
| ---------------- | ---------- | ----------------------------------------------------------------------- |
| `text`           | required   | A stack trace, log line, error message or URL (up to 20,000 characters) |
| `kind`           | `auto`     | `auto`, `stacktrace`, `log` or `url`                                    |
| `repos`, `group` | every repo | Narrow the search                                                       |

- **A stack trace** (JVM, Go, .NET, Node, Python, PHP, Ruby). Each application frame is resolved
  to a file by the longest matching path suffix, the way Sentry's code mappings do, so build-machine
  prefixes such as `/app/` or `C:\build\` don't matter. The first three frames come with their
  code, and library frames are counted and skipped. The message itself is then searched as well.
- **A log line or error message.**
  1. Timestamps, levels, logger names, ids, numbers, quoted values and URLs are masked.
  2. The constant fragments that remain are searched.
  3. A line that holds several fragments, or a logger or throw call, ranks first.
  4. Go-style wrapped errors (`a: b: c`) are split so each layer is found.
- **A URL or route** goes to `find_endpoint`.

```text
Stack trace (jvm): java.lang.IllegalStateException: Order already cancelled
Resolved 2 of 2 application frames; 1 library frame skipped.
#1 orders-java/src/main/java/com/acme/orders/service/OrderService.java:29 · in OrderService.cancel
  26: public Order cancel(String id) {
  27: Order order = find(id);
  28: if (order.isCancelled()) {
> 29: throw new IllegalStateException("Order already cancelled");
  30: }
```

If a frame points past the end of its file, the answer says that the build that failed differs
from this checkout.

## find_endpoint

Follows a request across services, from the routes the indexer extracted.

| Argument         | Default    | Meaning                                                                                                  |
| ---------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `query`          | required   | An HTTP path or URL (`/orders/123/cancel`, `POST /api/orders/{id}`), a gRPC `Service/Method`, or a topic |
| `kind`           | `auto`     | `auto`, `http`, `grpc` or `topic`                                                                        |
| `method`         | any        | HTTP method to require                                                                                   |
| `repos`, `group` | every repo | Narrow the search                                                                                        |
| `limit`          | 15         | Results per side (1–50)                                                                                  |

Concrete ids match route parameters: `/orders/123` matches both `/orders/{id}` and `/orders/:id`.
The answer separates where a request is served (handlers, consumers, proto definitions) from who
sends it (HTTP clients, producers, stubs):

```text
HTTP POST /api/payments/77/refund
Served by:
- payments-go/main.go:16  POST /api/payments/:id/refund  (gin, handler)
Called or produced by:
- orders-java/src/main/java/com/acme/orders/client/PaymentClient.java:9  POST /api/payments/{id}/refund  (feign, caller)
```

## git_history

Read-only git history of one repo.

| Argument | Default    | Meaning                                                                                    |
| -------- | ---------- | ------------------------------------------------------------------------------------------ |
| `repo`   | required   | Repo name                                                                                  |
| `action` | `log`      | `log`, `pickaxe`, `blame` or `show`                                                        |
| `path`   | whole repo | File or folder (log, pickaxe, blame)                                                       |
| `query`  | none       | pickaxe: the text that appeared or disappeared                                             |
| `regex`  | `false`    | pickaxe: match diff lines as a regex (`git -G`) instead of counting occurrences (`git -S`) |
| `rev`    | `HEAD`     | show: the commit; log: where to start                                                      |
| `lines`  | `1-80`     | blame: a range, at most 200 lines                                                          |
| `since`  | none       | log and pickaxe: `2026-09-01` or `14 days`                                                 |
| `limit`  | 20         | Commits (1–100)                                                                            |

`show` lists the file stats and the diff, with the diffs of sensitive files hidden. Revisions are
validated, so a value that starts with `-` is refused. git runs with no system or global config, no
pager and no fsmonitor.

## switch_branch

Lists one repo's branches, or switches the repo to one of them, so every other tool reads that
branch. A branch is local, or a remote branch already fetched to this machine (a fresh clone has
every branch as `origin/…`); switching to the latter creates its local branch from the copy on disk. Off by default: the tool is listed only when `ALLOW_BRANCH_SWITCH` in `.env` allows at least
one repo (`1` for every repo, or names separated by commas). It is the only tool that changes
anything (`readOnlyHint: false`, `destructiveHint: false`).

| Argument | Default  | Meaning                                                |
| -------- | -------- | ------------------------------------------------------ |
| `repo`   | required | Repo name                                              |
| `branch` | none     | `develop` or `origin/develop`; leave it out to list    |

```text
payments-clone: on main, 1 local branch.
* main
Fetched remote branches (1); switching to one creates its local branch, with no network:
  origin/develop (last commit 2026-10-19)
A branch that is not listed was never fetched; the owner runs git fetch first.
```

```text
payments-clone switched from main to develop.
develop was created from origin/develop, the copy fetched earlier (last commit 2026-10-19). Nothing was downloaded; newer commits on the server appear after the owner runs git fetch.
Every tool now reads this branch. The index catches up in the background; until then a search may miss lines that only this branch has.
```

Refused, before git runs: a repo `ALLOW_BRANCH_SWITCH` does not name, a branch that is neither
local nor fetched, a name fetched from several remotes (name one, `upstream/develop`), a name that is not a plain branch name (`--force`, `HEAD~1`, `a..b`), and a repo with
uncommitted changes to tracked files. The switch itself is one fixed command:

```text
git -c core.hooksPath=/dev/null -c protocol.allow=never -c submodule.recurse=false
    -c filter.lfs.smudge= -c filter.lfs.process= -c filter.lfs.required=false
    switch --no-guess --no-recurse-submodules --quiet --end-of-options <branch>
```

For a fetched remote branch the end becomes `--track --create=<branch> --end-of-options
origin/<branch>`, with the remote branch the service chose. `--no-guess` keeps git from picking
one on its own.
`protocol.allow=never` stops git from reaching any remote, even for a partial clone's missing
objects. No repo hook runs, and submodules and Git LFS files are not downloaded.
