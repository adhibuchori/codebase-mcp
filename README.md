# Codebase MCP (read-only)

**English** | [Bahasa Indonesia](README.id.md)

A small MCP server that lets **ClickUp Brain** (or any other MCP client) read the codebase on your laptop, whether it's a Mac or Windows machine.

```
                 ┌─ Mac:     Cloudflare Tunnel (+ Cloudflare Access) ─┐
ClickUp Brain ───┤                                                    ├──> your laptop (127.0.0.1:8787/mcp) ──> repo folders
                 └─ Windows: Pinggy (over the built-in ssh) ──────────┘
```

- **Mac** uses [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/). With a named tunnel and Cloudflare Access, requests without a valid token are blocked at Cloudflare before they ever reach your laptop.
- **Windows** uses [Pinggy](https://pinggy.io) over the `ssh` client that ships with Windows 10/11, for machines where installing software isn't allowed.

## Available tools

| Tool | What it does |
|---|---|
| `list_repos` | List the allowed repos |
| `project_tree` | Folder structure (skips node_modules, .git, build, etc.) |
| `read_file` | Read a file with line numbers, optionally a line range |
| `search_code` | Search text/regex across a repo, optionally filtered by glob (`*.java`) |
| `find_files` | Find files by name or glob (`*Controller.java`) |
| `git_info` | Branch, status, and recent commits (optionally for a single file) |

## Built-in safeguards

- **Read-only**: there are no tools to write, delete, or run arbitrary commands (git is limited to `log`/`status`/`rev-parse`).
- Only folders listed in `REPOS` can be read. `../` tricks, absolute paths, and symlinks pointing outside the repo are rejected.
- **Env files are never exposed**, in any form: `.env`, `.env.local`, `.env.example`, `.env-prod`, `.envrc`, `prod.env`, `app.env.bak`, and so on. They are left out of folder listings and searches, and reading one is refused. Windows tricks that open the same file (`.env.`, `.env::$DATA`) are blocked too. The rule lives in `security.js` and is covered by `bun test`.
- Other sensitive files are always blocked: `*.pem`, `*.key`, `*.jks`, `id_rsa`, `.npmrc`, names containing `secret`/`credentials`, `application-prod.yml`, and anything inside `.git`. Add more patterns via `EXTRA_BLOCKED`.
- An API key is required (`X-API-Key` header or `Authorization: Bearer`), compared in constant time.
- The server only listens on `127.0.0.1`; the tunnel is the only way in.
- Rate limit of 120 requests/minute per client IP. Every tool call is logged in the terminal.

> Your code passes through the tunnel provider (Cloudflare or Pinggy) on its way to ClickUp. If this is a company laptop or company code, check with your IT/security team first.

## Setup

### 1. Install the prerequisites

This project uses [Bun](https://bun.sh) to install dependencies and run the server.

**Mac**: Bun and cloudflared
```bash
brew install oven-sh/bun/bun cloudflared
```

**Windows**: Bun and ssh. Check in PowerShell:
```powershell
bun --version
ssh -V
```
- Bun missing: install it with `powershell -c "irm bun.sh/install.ps1 | iex"`. If your laptop doesn't allow installing Bun, use Node.js 18+ instead (see [Without Bun](#without-bun)).
- ssh missing: enable **OpenSSH Client** in *Settings → System → Optional features* (may need admin rights).

### 2. Install dependencies and generate an API key

```bash
cd codebase-mcp
bun install
bun run gen-key      # copy the output
```

### 3. Create the `.env` file

Copy `.env.example` to `.env`, then fill in:

```env
MCP_API_KEY=<output of gen-key>
REPOS=core-api=/Users/yourname/work/core-api;web=/Users/yourname/work/web-app
```

On Windows, use forward slashes in paths: `REPOS=core-api=C:/Users/yourname/work/core-api`.

### 4. Run it

There are two ways to run it.

#### Option A: open the tunnel only when you need it (recommended)

Keep the server running locally, and open the tunnel only while ClickUp needs access:

```bash
# Terminal 1: the server (reachable only from this laptop)
bun start

# Terminal 2: open the tunnel when you need it
bun tunnel
```

- Press **Ctrl+C** in terminal 2 to close the tunnel. ClickUp loses access right away, while the server keeps running locally until you stop terminal 1.
- `bun tunnel` picks the provider for you: Cloudflare on Mac, Pinggy on Windows. To override, set `TUNNEL=cloudflared` or `TUNNEL=pinggy` in `.env`.
- It refuses to start if the server isn't running.

#### Option B: everything at once

- **Mac**: `chmod +x start-mac.sh && ./start-mac.sh`. Ctrl+C stops both the tunnel and the server.
- **Windows**: double-click `start-windows.bat` (or run `.\start-windows.bat` in PowerShell). The server runs in a separate "Codebase MCP" window, which shows the logs. Close both windows to stop.

#### What the tunnel shows

- **Mac (Cloudflare)**: with `CF_TUNNEL_TOKEN` empty, you get a **quick tunnel**: a random `https://xxxx.trycloudflare.com` URL that changes on every restart. It's fine for testing, but it can't be protected with Cloudflare Access. For real use, set up a [named tunnel with Cloudflare Access](#mac-secure-setup-named-tunnel--cloudflare-access) and put its token in `CF_TUNNEL_TOKEN`.
- **Windows (Pinggy)**: the first time, ssh may ask you to trust the Pinggy host. Type `yes`. If it asks for a password, **just press Enter**. Pinggy then shows a URL like `https://abcd-12-34-56-78.run.pinggy-free.link`.
- **Your MCP URL = the tunnel URL + `/mcp`.**

Check it from another terminal. This calls the tunnel URL the way ClickUp will: health check, API key, tool list, and a wrong key that must be rejected.
```bash
bun run check https://<your-tunnel-url>
```
For a fixed URL, set `PUBLIC_URL` in `.env` and just run `bun run check`.

### 5. Connect it to ClickUp

Run `bun run check` first. If it passes, ClickUp will work with the same URL, key and headers.

Open ClickUp in a **browser** (not the desktop app) → **Settings → App Center → MCP Servers** → add a new server. The *Connect an MCP Server* form opens. Fill it in like this:

| Field | What to enter |
|---|---|
| **Name** | A name you'll recognize, e.g. `Work Codebase MCP` |
| **URL** | Your tunnel URL + `/mcp`, e.g. `https://work-codebase-mcp.yourdomain.com/mcp`. Use `/mcp`, not `/sse`. |
| **Description** | `Read-only access to my local codebase: browse folders, read files, search code, and view git history.` |
| **Authentication Method** | `Authorization header` |
| **Authorization Header**, left box | `Authorization` (keep the default) |
| **Authorization Header**, right box | `Bearer ` followed by the value of `MCP_API_KEY` in `.env`, e.g. `Bearer 3f9a…c21d`. Keep the space after `Bearer` and don't add one at the end. |

**Custom Headers** depend on the tunnel. Use **Add header** for each row, and delete rows you don't need with the trash icon:

| Tunnel | Header name | Header value |
|---|---|---|
| Cloudflare named tunnel + Access | `CF-Access-Client-Id` | the value of `CF_ACCESS_CLIENT_ID` in `.env` |
| | `CF-Access-Client-Secret` | the value of `CF_ACCESS_CLIENT_SECRET` in `.env` |
| Cloudflare quick tunnel | none | |
| Pinggy free tunnel | `X-Pinggy-No-Screen` | `1` (stops Pinggy's browser screening page) |

Click **Next**. ClickUp connects to the server and lists the 6 tools. Then try it in ClickUp Brain: *"Use the codebase MCP, show the structure of the core-api repo, then explain the login flow."*

If **Next** fails:

| What you see | Likely cause | Fix |
|---|---|---|
| Can't connect, or a timeout | The server or the tunnel isn't running | Start `bun start` and `bun tunnel`, then `bun run check` |
| `401 Unauthorized` | The API key doesn't match | Check the `Bearer ` prefix, and that the key equals `MCP_API_KEY` with no extra spaces |
| `403`, or a Cloudflare login page | The Access headers are missing or wrong | Check both `CF-Access-Client-*` headers and their values |
| `405` or `404` | The URL doesn't end in `/mcp` | Add `/mcp` to the URL |
| "Connected to the server, but couldn't validate the connection" | ClickUp reached the URL but the MCP handshake failed | Restart `bun start` so the latest server code runs, click **Next** again, and read the status code in the server log (see below) |
| Same message, and **nothing** appears in the server log | Cloudflare **Bot Fight Mode** challenges ClickUp's servers. In the domain's *Security → Events* you'll see *Managed Challenge* by *Bot fight mode*. | Turn off Bot Fight Mode for the domain (*Security → Settings*). On the Free plan it can't be skipped for a single hostname. Access and the API key still protect the MCP hostname. |
| `bun run check` passes, but ClickUp fails | A typo in the form | Compare each field with `.env` again |

Every request shows up in the server's terminal with its result, e.g. `POST /mcp initialize → 200` or `POST /mcp initialize → 401`. If nothing appears when you click **Next**, the request never reached your laptop: check the tunnel and the Cloudflare Access headers.

## Mac secure setup: named tunnel + Cloudflare Access

This gives you a **fixed URL** (e.g. `https://work-codebase-mcp.yourdomain.com`) and a second lock in front of your laptop: Cloudflare rejects any request that doesn't carry your service token, so it never reaches the server. The API key check still applies on top.

You need a free Cloudflare account and a domain whose DNS is managed by Cloudflare. **Bot Fight Mode must be off on that domain** (*Security → Settings*): it challenges ClickUp's servers, which can't solve a browser challenge, and on the Free plan it can't be turned off for just one hostname. If other sites on the domain need it, use a separate domain for the tunnel. Menu names in the Zero Trust dashboard sometimes change; the steps below describe what to look for.

1. **Create the tunnel**
   In the [Zero Trust dashboard](https://one.dash.cloudflare.com) → *Networks → Tunnels* → *Create a tunnel* → type **Cloudflared** → name it `work-codebase-mcp`. On the install step, copy the long token after `--token` (you don't need to run the install command).
2. **Route a hostname to your server**
   In the tunnel's *Public Hostname* (or *Published application routes*) tab, add:
   - Subdomain `work-codebase-mcp`, domain `yourdomain.com`
   - Service type **HTTP**, URL `127.0.0.1:8787`
3. **Create a service token**
   *Access → Service Auth → Service Tokens* → *Create Service Token*. Copy the **Client ID** and **Client Secret**. The secret is shown only once.
4. **Protect the hostname with Access**
   *Access → Applications* → *Add an application* → **Self-hosted** → domain `work-codebase-mcp.yourdomain.com`. Add a policy with action **Service Auth** that includes the service token from step 3.
5. **Put the values in `.env`**
   ```env
   CF_TUNNEL_TOKEN=<token from step 1>
   PUBLIC_URL=https://work-codebase-mcp.yourdomain.com
   CF_ACCESS_CLIENT_ID=<client id from step 3>
   CF_ACCESS_CLIENT_SECRET=<client secret from step 3>
   ```
   Only `CF_TUNNEL_TOKEN` is used to run the tunnel. The other three are for `bun run check`; the server never reads them.
   Then run `bun tunnel` (or `./start-mac.sh`) as usual.
6. **Test it**
   ```bash
   bun run check
   ```
   With the service token set, it also confirms that Cloudflare blocks requests without the token.
7. **In ClickUp**, use URL `https://work-codebase-mcp.yourdomain.com/mcp`, the `Authorization: Bearer <API key>` header, and the two custom headers `CF-Access-Client-Id` and `CF-Access-Client-Secret` with the same values as in `.env`.

## Free vs. fixed URL on Windows (Pinggy)

A free Pinggy tunnel gets a **random URL** and is **time-limited**. When it closes, `bun tunnel` asks you to press Enter to reconnect. The new URL is different, so you have to update it in ClickUp.

For a fixed URL with no time limit, use **Pinggy Pro** (paid): get your access token from the Pinggy dashboard, assign a persistent subdomain to it, and put it in `.env` as `PINGGY_TOKEN=<your token>`.

## Without Bun

On a laptop where Bun can't be installed (such as a locked-down work laptop), use Node.js 18+ and npm instead. The code runs the same on both:

```bash
npm install
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # instead of: bun run gen-key
node server.js                                                             # instead of: bun start
node tunnel.js                                                             # instead of: bun tunnel
```

`start-windows.bat` switches to Node automatically when Bun isn't found.

## Tips

- The laptop must be on, awake, and running the tunnel. On Mac, `bun tunnel` keeps it awake with `caffeinate` while the tunnel is open. On Windows, set Power Options so it doesn't sleep while plugged in.
- Run `git pull` regularly so the AI reads the latest code.
- Rotate the API key (`bun run gen-key`) if it was ever shared, then update it in ClickUp. Do the same for the Cloudflare service token.
- Closing the tunnel (Ctrl+C in `bun tunnel`) cuts off ClickUp's access immediately. The server alone is reachable only from your laptop.
