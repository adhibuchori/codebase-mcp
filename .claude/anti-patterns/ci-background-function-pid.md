---
paths:
  - 'scripts/ci/**'
  - 'scripts/**/*.sh'
  - '*.sh'
---

# `$!` of a backgrounded shell function is the subshell, not the program

**Symptom.** A CI or helper script starts the server in the background, and its `trap … kill`
"stops" it. The server keeps running on port 8787 anyway. The next run cannot bind, and its checks
quietly talk to the old server: in this repo, with the old random API key, as a `401`.

**Cause.** `node_ts src/index.ts start &`, where `node_ts` is a shell function, backgrounds a
subshell that runs the function. `$!` is that subshell's PID; killing it leaves `node` orphaned.

**Fix.** Background the program itself (`node … src/index.ts start &`) so `$!` is its PID. Or end
the function with `exec node …`.

**Signal it is back.** `lsof -iTCP:8787 -sTCP:LISTEN` shows a server after the script exited.
