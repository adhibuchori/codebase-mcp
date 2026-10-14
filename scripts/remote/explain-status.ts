/**
 * What a failed request through the tunnel means, and what to do about it. Cloudflare answers for
 * the server when Access refuses a request or the tunnel is down, so the status alone does not say
 * whether the request ever reached the laptop.
 */

export interface FailedResponse {
  readonly status: number;
  /** Cloudflare Access sets the cf-access-domain header on every answer it gives itself. */
  readonly fromAccess: boolean;
  readonly location: string | null;
}

/** A redirect to the team's Access login page, judged by the host only, never a substring. */
function isAccessLogin(location: string | null): boolean {
  const host = location ? URL.parse(location)?.hostname : undefined;
  return host?.endsWith('.cloudflareaccess.com') ?? false;
}

export function explainStatus(response: FailedResponse): string[] {
  if (response.fromAccess && response.status === 403)
    return [
      'Cloudflare Access refused the service token; the request never reached your laptop.',
      'Compare CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET in .env with Zero Trust → Access →',
      'Service credentials (a refreshed token has a new secret), and check that the application has a',
      'policy with the action "Service Auth" that includes this token.',
    ];
  if (isAccessLogin(response.location))
    return [
      'Cloudflare Access sent the request to its login page: no policy lets this service token in.',
      'Give the application a policy with the action "Service Auth" (not "Allow") that includes it.',
    ];
  if (response.status === 530)
    return [
      'Cloudflare cannot reach your tunnel (error 1033). Is bun tunnel running the named tunnel?',
      'It needs CF_TUNNEL_TOKEN in .env. Without it, bun tunnel opens a temporary quick tunnel at a',
      'different *.trycloudflare.com URL and prints "Opening a temporary quick tunnel".',
    ];
  if (response.status === 502)
    return ['The tunnel is up, but nothing answers on the local port. Is bun start running?'];
  return [];
}
