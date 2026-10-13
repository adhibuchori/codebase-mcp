/**
 * The caller's address. Behind a tunnel every request arrives from 127.0.0.1, so the address the
 * tunnel forwards (Cloudflare's cf-connecting-ip, else the first x-forwarded-for hop) is used.
 */
export function clientIp(headers: Headers): string {
  const cloudflare = headers.get('cf-connecting-ip');
  if (cloudflare) return cloudflare.trim();
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || 'local';
}
