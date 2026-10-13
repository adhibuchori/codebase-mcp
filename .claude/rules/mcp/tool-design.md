---
paths:
  - 'src/tools/**'
  - 'src/engine/**'
---

# MCP tool design

Every answer is read by a model with a limited context; tokens are the cost. These rules come from
Anthropic's "Writing effective tools for agents" and from measuring v1 (one `read_file` call cost
~39,500 tokens). `AGENTS.md` Rules 49–53 are the enforced subset.

- **Bounded by default.** Every tool has a default limit, a hard character budget
  (`limits.maxResponseTokens`) and a cursor or a narrowing hint. No tool can return an unbounded
  list (Rule 49).
- **Step down, then cut.** Render the most detailed level that fits (`pickLevel`): full → fewer
  lines per file → one line per file → counts. Only the last level is ever truncated.
- **Text, not JSON.** Paths once per file, `line: code` below it, no repeated keys. No
  `outputSchema`/`structuredContent`: the spec asks for the text too, which doubles the tokens.
- **References are inputs.** Every location is printed as `repo/path:line` and `read_code`
  accepts exactly that (and `repo/path#Symbol`).
- **Progressive disclosure.** Orientation (`list_repos`, `repo_overview`) before search, outline
  before content, one symbol before the whole file.
- **Errors steer.** A `ToolError` says what was wrong and gives a hint with a valid example. Any
  other error is logged and reported generically; paths and stacks never reach the model.
- **Descriptions** are 3–4 sentences with one JSON example, under 2,048 characters, in English.
  Tool names are snake_case without dots (some clients reject dots).
- **≤ 9 tools.** More tools cost tokens on every request and confuse selection; extend an
  existing tool with a mode before adding one.
- **Measure.** A change to ranking, budgets or formats runs `bun run eval` before and after.
