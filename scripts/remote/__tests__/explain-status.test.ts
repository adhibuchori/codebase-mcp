import { expect, test } from 'bun:test';
import { explainStatus } from '../explain-status.ts';

const failed = (status: number, fromAccess = false, location: string | null = null) =>
  explainStatus({ status, fromAccess, location }).join(' ');

test('a 403 from Access points at the service token and the policy', () => {
  expect(failed(403, true)).toContain('Cloudflare Access refused the service token');
  expect(failed(403, true)).toContain('"Service Auth"');
});

test('a redirect to the Access login page points at the policy action', () => {
  expect(failed(302, true, 'https://team.cloudflareaccess.com/cdn-cgi/access/login')).toContain(
    'not "Allow"',
  );
});

test('530 points at the named tunnel and its token', () => {
  expect(failed(530)).toContain('CF_TUNNEL_TOKEN');
});

test('502 points at the local server', () => {
  expect(failed(502)).toContain('bun start');
});

test('a 403 that Access did not send, or any other status, adds nothing', () => {
  expect(failed(403)).toBe('');
  expect(failed(404)).toBe('');
  expect(failed(302, false, 'https://example.com/elsewhere')).toBe('');
});
