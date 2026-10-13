#!/usr/bin/env bun
/**
 * Open a tunnel to the local MCP server. ClickUp can only reach the server while this runs;
 * Ctrl+C closes the tunnel and leaves the server running locally.
 * - Mac/Linux: Cloudflare Tunnel (named tunnel if CF_TUNNEL_TOKEN is set, otherwise a quick tunnel)
 * - Windows:   Pinggy over the built-in ssh (Pinggy Pro if PINGGY_TOKEN is set)
 * Set TUNNEL=cloudflared or TUNNEL=pinggy in .env to override.
 */
import { spawn, spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { loadDotEnv } from "./env.js";

const DOTENV_KEYS = loadDotEnv();

/**
 * The tunnel program gets the shell environment without anything from .env or any known secret.
 * cloudflared prints the environment variables it sees to its log, so a token passed along would be leaked.
 */
const SECRET_KEYS = ["MCP_API_KEY", "CF_TUNNEL_TOKEN", "CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET", "PINGGY_TOKEN", "TUNNEL_TOKEN"];
const CHILD_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !DOTENV_KEYS.includes(key) && !SECRET_KEYS.includes(key))
);

const PORT = Number(process.env.PORT || 8787);
const LOCAL_URL = `http://127.0.0.1:${PORT}`;
const PROVIDER = (process.env.TUNNEL || (process.platform === "win32" ? "pinggy" : "cloudflared")).toLowerCase();

function hasCommand(cmd, versionArg) {
  return spawnSync(cmd, [versionArg], { stdio: "ignore" }).error?.code !== "ENOENT";
}

function run(cmd, args, env = CHILD_ENV) {
  /** caffeinate keeps the Mac awake only while the tunnel is open */
  const [bin, argv] = process.platform === "darwin" ? ["caffeinate", ["-i", cmd, ...args]] : [cmd, args];
  /** Ctrl+C reaches the tunnel too; wait for it to shut down instead of exiting first */
  const ignore = () => {};
  process.on("SIGINT", ignore);
  return new Promise((resolve) => {
    spawn(bin, argv, { stdio: "inherit", env }).on("exit", (code) => {
      process.off("SIGINT", ignore);
      resolve(code ?? 0);
    });
  });
}

async function serverIsUp() {
  try {
    return (await fetch(`${LOCAL_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

async function cloudflared() {
  if (!hasCommand("cloudflared", "--version")) {
    console.error("❌ cloudflared is not installed: brew install cloudflared");
    return 1;
  }
  const token = process.env.CF_TUNNEL_TOKEN;
  if (token) {
    const publicUrl = (process.env.PUBLIC_URL || "https://<your public hostname>").replace(/\/+$/, "");
    console.log(`🌐 Starting named Cloudflare Tunnel... your MCP URL is ${publicUrl}/mcp`);
    /** Only TUNNEL_TOKEN, which cloudflared masks in its log; never on the command line, where the process list shows it */
    return run("cloudflared", ["tunnel", "run"], { ...CHILD_ENV, TUNNEL_TOKEN: token });
  }
  console.log("🌐 Opening a temporary quick tunnel (testing only)... copy the https://xxxx.trycloudflare.com URL below and append /mcp to it.");
  return run("cloudflared", ["tunnel", "--url", LOCAL_URL]);
}

async function pinggy() {
  if (!hasCommand("ssh", "-V")) {
    console.error('❌ ssh not found. On Windows, enable "OpenSSH Client" in Settings > System > Optional features.');
    return 1;
  }
  const token = process.env.PINGGY_TOKEN;
  const target = token ? `${token}@pro.pinggy.io` : "free.pinggy.io";
  const args = [
    "-p", "443", `-R0:127.0.0.1:${PORT}`,
    "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3", "-o", "StrictHostKeyChecking=accept-new",
    target,
  ];
  for (;;) {
    console.log("\n🌐 Opening Pinggy tunnel... copy the https:// URL it shows and append /mcp to it.");
    console.log("   If ssh asks for a password, just press Enter.");
    await run("ssh", args);
    /** Only read the keyboard after ssh has exited, so the two never compete for input */
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on("SIGINT", () => process.exit(0));
    await rl.question("\nTunnel closed. Press Enter to reconnect (a free URL will change), or Ctrl+C to quit. ");
    rl.close();
  }
}

if (!(await serverIsUp())) {
  console.error(`❌ The MCP server is not running on ${LOCAL_URL}. Start it first in another terminal: bun start`);
  process.exit(1);
}

const tunnels = { cloudflared, pinggy };
if (!tunnels[PROVIDER]) {
  console.error(`❌ Unknown TUNNEL "${PROVIDER}". Use "cloudflared" or "pinggy".`);
  process.exit(1);
}
process.exit(await tunnels[PROVIDER]());
