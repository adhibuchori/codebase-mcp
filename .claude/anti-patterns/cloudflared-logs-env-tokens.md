# cloudflared logs the environment it was started with

**Symptom.** The tunnel's terminal output shows `CF_TUNNEL_TOKEN=eyJ…` (or any other `.env` value)
in plain text, next to cloudflared's startup lines.

**Cause.** cloudflared prints the environment variables it sees when it starts. v1's tunnel script
passed the whole process environment, which by then held every key loaded from `.env`.

**Fix.** `scripts/tunnel/child-env.ts` builds the child's environment from the shell's, minus every
key `.env` defines and every known secret (`SECRET_KEYS`). The named-tunnel token reaches
cloudflared only as `TUNNEL_TOKEN`, which cloudflared masks, and never on the command line, where
the process list would show it. A leaked token is rotated in the Cloudflare dashboard.

**Signal it is back.** A secret-looking value in the tunnel output, or a new tunnel provider started
with `process.env` instead of `childEnv(...)`.
