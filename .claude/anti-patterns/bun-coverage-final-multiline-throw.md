---
paths:
  - 'src/**'
---

# Bun misses the last line of a multi-line throw that ends a function

**Symptom.** `bun test --coverage` reports a line as uncovered although a test proves the throw
happens. It is always the closing `);` of a `throw new ToolError(\n …,\n …,\n);` that is the
function's last statement. It usually shows up right after oxfmt wrapped a long `throw` onto several
lines.

**Cause.** JavaScriptCore's basic-block coverage gives that closing line to the block after the
throw, which never runs. The same throw inside an `if`, followed by more code, is reported as
covered.

**Fix.** Compute the message or hint first, and throw on one line:

```ts
const hint = names ? `Symbols here: ${names}.` : 'This file has no symbols; read it by line range.';
throw new ToolError(`No symbol "${wanted}" in this file.`, hint);
```

Never exempt the file or delete the branch to reach 100%.

**Signal it is back.** A coverage gap whose only uncovered line is a lone `);`.
