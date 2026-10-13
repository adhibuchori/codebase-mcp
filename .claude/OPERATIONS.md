# Operations

Operational facts for running codebase-mcp on the maintainer's machines. The working agreements
point here; the README holds the full setup.

| Fact                | Value                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Server              | `bun start`, listens on `127.0.0.1:8787`; MCP at `/mcp`, liveness at `/health`                                                       |
| Mac tunnel          | Cloudflare named tunnel `work-codebase-mcp`, guarded by Cloudflare Access (service token). The public URL is `PUBLIC_URL` in `.env`. |
| Windows tunnel      | Pinggy over the built-in ssh (`bun tunnel`); the free tier gets a new URL on each connect                                            |
| ClickUp             | URL = public URL + `/mcp`; `Authorization: Bearer <MCP_API_KEY>`; the two `CF-Access-Client-*` custom headers on the Mac tunnel      |
| Cloudflare domain   | Bot Fight Mode must stay off, or ClickUp's servers get a challenge they cannot solve                                                 |
| Windows work laptop | No installs and no outbound SSH without IT approval. Bun may be missing: use Node 22.18+ through `start-windows.bat`.                |
| Index               | `.cache/index/`, one SQLite file per repo; safe to delete, and rebuilt on start                                                      |
| End-to-end check    | `bun run check` (public URL), `bun run doctor` (local setup)                                                                         |

Secrets live only in `.env`: `MCP_API_KEY`, `CF_TUNNEL_TOKEN`, the Access service token and
`PINGGY_TOKEN`. Rotation steps are in SECURITY.md.
