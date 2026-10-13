#!/usr/bin/env bun
/**
 * `bun tunnel`: opens a tunnel to the local MCP server. ClickUp can only reach the server while
 * this runs; Ctrl+C closes the tunnel and leaves the server running. Set TUNNEL=cloudflared or
 * TUNNEL=pinggy in .env to override the platform default.
 */
import { loadEnvFile } from '../shared/env-file.ts';
import { childEnv } from './child-env.ts';
import { serverIsUp } from './process.ts';
import { cloudflared, pinggy, type TunnelContext } from './providers.ts';

const dotenvKeys = loadEnvFile();
const port = Number(process.env['PORT'] || 8787);
const localUrl = `http://127.0.0.1:${port}`;
const provider = (
  process.env['TUNNEL'] || (process.platform === 'win32' ? 'pinggy' : 'cloudflared')
).toLowerCase();
const providers: Readonly<Record<string, (context: TunnelContext) => Promise<number>>> = {
  cloudflared,
  pinggy,
};
const open = providers[provider];

if (!(await serverIsUp(localUrl))) {
  console.error(
    `❌ The MCP server is not running on ${localUrl}. Start it first in another terminal: bun start`,
  );
  process.exit(1);
}
if (!open) {
  console.error(`❌ Unknown TUNNEL "${provider}". Use "cloudflared" or "pinggy".`);
  process.exit(1);
}
process.exit(
  await open({ port, localUrl, env: childEnv(process.env, dotenvKeys), settings: process.env }),
);
