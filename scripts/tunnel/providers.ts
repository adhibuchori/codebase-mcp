/**
 * The two tunnel providers. Mac/Linux: Cloudflare Tunnel (named when CF_TUNNEL_TOKEN is set,
 * otherwise a temporary quick tunnel). Windows: Pinggy over the built-in ssh (Pinggy Pro with
 * PINGGY_TOKEN). The token reaches cloudflared only as TUNNEL_TOKEN, which it masks in its log,
 * never on the command line, where the process list would show it.
 */
import readline from 'node:readline/promises';
import { hasCommand, runForeground } from './process.ts';

export interface TunnelContext {
  readonly port: number;
  readonly localUrl: string;
  readonly env: Record<string, string>;
  readonly settings: Readonly<Record<string, string | undefined>>;
}

export async function cloudflared(context: TunnelContext): Promise<number> {
  if (!hasCommand('cloudflared', '--version')) {
    console.error('❌ cloudflared is not installed: brew install cloudflared');
    return 1;
  }
  const token = context.settings['CF_TUNNEL_TOKEN'];
  if (token) {
    const publicUrl = (context.settings['PUBLIC_URL'] || 'https://<your public hostname>').replace(
      /\/+$/,
      '',
    );
    console.log(`🌐 Starting the named Cloudflare Tunnel… your MCP URL is ${publicUrl}/mcp`);
    return runForeground('cloudflared', ['tunnel', 'run'], { ...context.env, TUNNEL_TOKEN: token });
  }
  console.log(
    '🌐 Opening a temporary quick tunnel (testing only)… copy the https://xxxx.trycloudflare.com URL below and append /mcp to it.',
  );
  return runForeground('cloudflared', ['tunnel', '--url', context.localUrl], context.env);
}

async function askToReconnect(): Promise<void> {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  prompt.on('SIGINT', () => process.exit(0));
  await prompt.question(
    '\nTunnel closed. Press Enter to reconnect (a free URL will change), or Ctrl+C to quit. ',
  );
  prompt.close();
}

export async function pinggy(context: TunnelContext): Promise<number> {
  if (!hasCommand('ssh', '-V')) {
    console.error(
      '❌ ssh not found. On Windows, enable "OpenSSH Client" in Settings > System > Optional features.',
    );
    return 1;
  }
  const token = context.settings['PINGGY_TOKEN'];
  const target = token ? `${token}@pro.pinggy.io` : 'free.pinggy.io';
  const args = [
    '-p',
    '443',
    `-R0:127.0.0.1:${context.port}`,
    '-o',
    'ServerAliveInterval=30',
    '-o',
    'ServerAliveCountMax=3',
    '-o',
    'StrictHostKeyChecking=accept-new',
    target,
  ];
  const connect = async (): Promise<number> => {
    console.log(
      '\n🌐 Opening the Pinggy tunnel… copy the https:// URL it shows and append /mcp to it.',
    );
    console.log('   If ssh asks for a password, just press Enter.');
    await runForeground('ssh', args, context.env);
    /* Only read the keyboard after ssh has exited, so the two never compete for input. */
    await askToReconnect();
    return connect();
  };
  return connect();
}
