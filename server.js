#!/usr/bin/env bun
/**
 * Codebase MCP Server (read-only)
 * Lets an AI (e.g. ClickUp Brain) read the codebase on your laptop over MCP.
 * Runs on macOS, Windows, and Linux. Read-only: it cannot write, delete, or run commands.
 */
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadDotEnv } from "./env.js";
import { isSensitiveName } from "./security.js";

const execFileAsync = promisify(execFile);

/** ---------- Configuration ---------- */
loadDotEnv();

const PORT = Number(process.env.PORT || 8787);
/** Localhost only; the tunnel exposes it to the internet */
const HOST = process.env.HOST || "127.0.0.1";
const API_KEY = process.env.MCP_API_KEY || "";
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES || 512 * 1024);
const MAX_SEARCH_RESULTS = Number(process.env.MAX_SEARCH_RESULTS || 200);

/** REPOS="core=/Users/me/work/core-api;web=C:\\work\\web-app" */
const REPOS = parseRepos(process.env.REPOS || "");

const IGNORED_DIRS = new Set([
  ".git", "node_modules", "vendor", "dist", "build", "out", "target", ".next", ".nuxt",
  ".gradle", ".idea", ".vscode", "__pycache__", ".venv", "venv", "coverage", ".cache", "Pods", "bin", "obj",
]);
/** Extra sensitive file patterns on top of the built-in list in security.js */
const EXTRA_BLOCKED = (process.env.EXTRA_BLOCKED || "").split(",").map((s) => s.trim()).filter(Boolean).map((p) => new RegExp(p, "i"));

if (!API_KEY || API_KEY.length < 24) {
  console.error("❌ MCP_API_KEY is missing or too short (min. 24 characters). Run: bun run gen-key");
  process.exit(1);
}
if (REPOS.size === 0) {
  console.error('❌ REPOS is not set. Example: REPOS="core=/Users/me/work/core-api"');
  process.exit(1);
}

/** ---------- Helper ---------- */
function parseRepos(str) {
  const map = new Map();
  for (const part of str.split(";").map((s) => s.trim()).filter(Boolean)) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    const dir = part.slice(i + 1).trim();
    try {
      const real = fsSync.realpathSync(dir);
      if (!fsSync.statSync(real).isDirectory()) throw new Error("not a directory");
      map.set(name, real);
    } catch (e) {
      console.error(`⚠️  Skipping repo "${name}": ${dir} (${e.message})`);
    }
  }
  return map;
}

function isBlockedName(name) {
  return isSensitiveName(name, EXTRA_BLOCKED);
}

/** Resolve a relative path to a SAFE absolute path (cannot escape the repo root). */
async function safeResolve(repo, relPath = ".") {
  const root = REPOS.get(repo);
  if (!root) throw new Error(`Unknown repo "${repo}". Available repos: ${[...REPOS.keys()].join(", ")}`);
  const target = path.resolve(root, relPath);
  let real;
  try {
    /** Follow symlinks, then re-check */
    real = await fs.realpath(target);
  } catch {
    throw new Error(`Path not found: ${relPath}`);
  }
  const rel = path.relative(root, real);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Access denied: path is outside the repo.");
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.includes(".git")) throw new Error("Access denied: .git directory.");
  if (parts.some(isBlockedName)) throw new Error("Access denied: sensitive file.");
  return { root, real, rel: rel.split(path.sep).join("/") || "." };
}

async function isProbablyBinary(file) {
  const fh = await fs.open(file, "r");
  try {
    const buf = Buffer.alloc(8000);
    const { bytesRead } = await fh.read(buf, 0, 8000, 0);
    return buf.subarray(0, bytesRead).includes(0);
  } finally {
    await fh.close();
  }
}

async function* walk(root, dir, depth, maxDepth) {
  if (depth > maxDepth) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    if (isBlockedName(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue;
      yield { full, rel: path.relative(root, full).split(path.sep).join("/"), dir: true, depth };
      yield* walk(root, full, depth + 1, maxDepth);
    } else if (e.isFile()) {
      yield { full, rel: path.relative(root, full).split(path.sep).join("/"), dir: false, depth };
    }
  }
}

function globToRegex(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, ".").replace(/\u0000/g, ".*");
  return new RegExp(`(^|/)${esc}$`, "i");
}

const text = (t) => ({ content: [{ type: "text", text: t }] });
const fail = (e) => ({ content: [{ type: "text", text: `Error: ${e.message || e}` }], isError: true });

/** ---------- MCP server & tools ---------- */
function buildServer() {
  const server = new McpServer({ name: "codebase-reader", version: "1.0.0" });
  const repoArg = z.string().describe(`Repo name. Options: ${[...REPOS.keys()].join(", ")}`);

  server.registerTool(
    "list_repos",
    { title: "List repos", description: "List the repos/codebases that can be read.", inputSchema: {} },
    async () => text([...REPOS.keys()].map((n) => `- ${n}`).join("\n"))
  );

  server.registerTool(
    "project_tree",
    {
      title: "Project tree",
      description: "Show the folder & file structure of a repo (folders like node_modules, .git, and build are skipped).",
      inputSchema: {
        repo: repoArg,
        path: z.string().default(".").describe("Sub-folder relative to the repo root"),
        max_depth: z.number().int().min(0).max(8).default(3),
      },
    },
    async ({ repo, path: p, max_depth }) => {
      try {
        const { root, real, rel } = await safeResolve(repo, p);
        const lines = [`${repo}/${rel === "." ? "" : rel}`];
        let count = 0;
        for await (const item of walk(root, real, 0, max_depth)) {
          if (++count > 2000) { lines.push("… (truncated, use a more specific path)"); break; }
          lines.push(`${"  ".repeat(item.depth + 1)}${path.posix.basename(item.rel)}${item.dir ? "/" : ""}`);
        }
        return text(lines.join("\n"));
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "read_file",
    {
      title: "Read file",
      description: "Read a text file from the repo with line numbers. Can be limited to a line range.",
      inputSchema: {
        repo: repoArg,
        path: z.string().describe("File path relative to the repo root, e.g. src/main/App.java"),
        start_line: z.number().int().min(1).optional(),
        end_line: z.number().int().min(1).optional(),
      },
    },
    async ({ repo, path: p, start_line, end_line }) => {
      try {
        const { real, rel } = await safeResolve(repo, p);
        const st = await fs.stat(real);
        if (!st.isFile()) throw new Error("Not a file.");
        if (await isProbablyBinary(real)) throw new Error("Binary file, not read.");
        if (st.size > MAX_FILE_BYTES && !start_line)
          throw new Error(`File too large (${st.size} bytes). Use start_line/end_line.`);
        const lines = (await fs.readFile(real, "utf8")).split(/\r?\n/);
        const s = (start_line || 1) - 1;
        const e = Math.min(end_line || lines.length, lines.length, s + 3000);
        const width = String(e).length;
        const body = lines.slice(s, e).map((l, i) => `${String(s + i + 1).padStart(width)}│ ${l}`).join("\n");
        return text(`# ${repo}/${rel} (lines ${s + 1}-${e} of ${lines.length})\n${body}`);
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "search_code",
    {
      title: "Search code",
      description: "Search for text/regex across all files in a repo. Returns the file, line number, and matching line.",
      inputSchema: {
        repo: repoArg,
        query: z.string().min(1).describe("Text or regex to search for"),
        is_regex: z.boolean().default(false),
        case_sensitive: z.boolean().default(false),
        file_glob: z.string().optional().describe("File filter, e.g. *.java or src/**/*.ts"),
        path: z.string().default(".").describe("Limit the search to a sub-folder"),
      },
    },
    async ({ repo, query, is_regex, case_sensitive, file_glob, path: p }) => {
      try {
        const { root, real } = await safeResolve(repo, p);
        const flags = case_sensitive ? "" : "i";
        const re = is_regex ? new RegExp(query, flags) : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
        const globRe = file_glob ? globToRegex(file_glob) : null;
        const results = [];
        let filesScanned = 0;
        outer: for await (const item of walk(root, real, 0, 50)) {
          if (item.dir) continue;
          if (globRe && !globRe.test(item.rel)) continue;
          const st = await fs.stat(item.full).catch(() => null);
          if (!st || st.size > MAX_FILE_BYTES) continue;
          if (await isProbablyBinary(item.full).catch(() => true)) continue;
          filesScanned++;
          const lines = (await fs.readFile(item.full, "utf8")).split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) {
              results.push(`${item.rel}:${i + 1}: ${lines[i].trim().slice(0, 240)}`);
              if (results.length >= MAX_SEARCH_RESULTS) break outer;
            }
          }
        }
        if (!results.length) return text(`No results for "${query}" (${filesScanned} files scanned).`);
        const more = results.length >= MAX_SEARCH_RESULTS ? `\n… limited to ${MAX_SEARCH_RESULTS} results, narrow your search.` : "";
        return text(`${results.length} results:\n${results.join("\n")}${more}`);
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "find_files",
    {
      title: "Find files",
      description: "Find files by name or glob pattern, e.g. *Controller.java or **/config/*.yml",
      inputSchema: { repo: repoArg, pattern: z.string().min(1) },
    },
    async ({ repo, pattern }) => {
      try {
        const { root } = await safeResolve(repo, ".");
        const re = pattern.includes("*") || pattern.includes("?") ? globToRegex(pattern) : null;
        const out = [];
        for await (const item of walk(root, root, 0, 50)) {
          if (item.dir) continue;
          const ok = re ? re.test(item.rel) : path.posix.basename(item.rel).toLowerCase().includes(pattern.toLowerCase());
          if (ok) out.push(item.rel);
          if (out.length >= 500) break;
        }
        return text(out.length ? out.join("\n") : "No matching files.");
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "git_info",
    {
      title: "Git info",
      description: "Show the current branch, status, and recent commits (read-only). Optional: history of a single file.",
      inputSchema: {
        repo: repoArg,
        limit: z.number().int().min(1).max(100).default(15),
        file: z.string().optional().describe("File path to show the commit history for"),
      },
    },
    async ({ repo, limit, file }) => {
      try {
        const { root } = await safeResolve(repo, ".");
        const git = (args) => execFileAsync("git", ["-C", root, "--no-pager", ...args], { maxBuffer: 4 * 1024 * 1024, timeout: 15000 }).then((r) => r.stdout.trim());
        const logArgs = ["log", `-n${limit}`, "--date=short", "--pretty=format:%h %ad %an  %s"];
        if (file) { const { rel } = await safeResolve(repo, file); logArgs.push("--", rel); }
        const [branch, status, log] = await Promise.all([
          git(["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "(not a git repo)"),
          git(["status", "--short"]).catch(() => ""),
          git(logArgs).catch(() => ""),
        ]);
        return text(`Branch: ${branch}\n\nLocal changes:\n${status || "(clean)"}\n\nRecent commits${file ? ` for ${file}` : ""}:\n${log || "-"}`);
      } catch (e) { return fail(e); }
    }
  );

  return server;
}

/** ---------- HTTP + authentication ---------- */
const app = express();
app.disable("x-powered-by");

/** Log every request with its result, so a client that fails to connect shows why in the terminal */
app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    const rpc = req.body?.method ? ` ${req.body.method}` : "";
    const tool = req.body?.params?.name ? ` → ${req.body.params.name} ${JSON.stringify(req.body.params.arguments || {})}` : "";
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}${rpc}${tool} → ${res.statusCode} (${Date.now() - started} ms, ${clientIp(req)})`);
  });
  next();
});
app.use(express.json({ limit: "1mb" }));

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Behind a tunnel every request arrives from 127.0.0.1, so use the client IP the tunnel forwards */
function clientIp(req) {
  return req.headers["cf-connecting-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
}

/** Simple per-IP rate limit */
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = clientIp(req);
  const now = Date.now();
  const rec = hits.get(ip) || { n: 0, t: now };
  if (now - rec.t > 60_000) { rec.n = 0; rec.t = now; }
  rec.n++;
  hits.set(ip, rec);
  if (rec.n > 120) return res.status(429).json({ error: "Too many requests" });
  next();
}

function auth(req, res, next) {
  /** Tolerate "Bearer " typed in the form while the client adds its own prefix too */
  const header = req.headers["x-api-key"] || (req.headers.authorization || "").replace(/^(Bearer\s+)+/i, "").trim();
  if (!header || !safeEqual(String(header), API_KEY)) {
    return res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
  }
  next();
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/mcp", rateLimit, auth, async (req, res) => {
  /**
   * The SDK answers 406 unless Accept lists both JSON and SSE. Some clients send only "application/json",
   * a wildcard, or nothing, and this server always replies with plain JSON anyway, so accept them.
   */
  req.headers.accept = "application/json, text/event-stream";
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
  }
});

/** Stateless mode: GET/DELETE are not used */
app.all("/mcp", rateLimit, auth, (_req, res) =>
  res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null })
);

app.listen(PORT, HOST, () => {
  console.log(`✅ Codebase MCP running at http://${HOST}:${PORT}/mcp`);
  for (const [n, d] of REPOS) console.log(`   • ${n} → ${d}`);
  console.log("   Mode: READ-ONLY. Press Ctrl+C to stop.");
});
