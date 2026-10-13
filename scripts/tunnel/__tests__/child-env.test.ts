import { expect, test } from 'bun:test';
import { childEnv, SECRET_KEYS } from '../child-env.ts';

test('the tunnel program never sees a key from .env or a known secret', () => {
  const env = childEnv(
    {
      PATH: '/usr/bin',
      HOME: '/home/me',
      CF_TUNNEL_TOKEN: 'token',
      CUSTOM_FROM_DOTENV: 'x',
      EMPTY: undefined,
    },
    ['CUSTOM_FROM_DOTENV'],
  );
  expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/me' });
});

test('every known tunnel and access secret is listed', () => {
  expect(SECRET_KEYS).toEqual(
    expect.arrayContaining([
      'MCP_API_KEY',
      'CF_TUNNEL_TOKEN',
      'CF_ACCESS_CLIENT_SECRET',
      'PINGGY_TOKEN',
      'TUNNEL_TOKEN',
    ]),
  );
});
