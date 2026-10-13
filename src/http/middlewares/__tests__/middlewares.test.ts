import { describe, expect, test } from 'bun:test';
import { keysMatch, presentedKey } from '../api-key.middleware.ts';
import { clientIp } from '../client-ip.ts';
import { createRateLimiter } from '../rate-limit.middleware.ts';

describe('presentedKey and keysMatch', () => {
  test('X-API-Key wins; Authorization loses every Bearer prefix', () => {
    expect(presentedKey(new Headers({ 'x-api-key': ' abc ', authorization: 'Bearer other' }))).toBe(
      'abc',
    );
    expect(presentedKey(new Headers({ authorization: 'bearer  Bearer abc' }))).toBe('abc');
    expect(presentedKey(new Headers())).toBe('');
  });

  test('an empty key never matches', () => {
    expect(keysMatch('', '')).toBe(false);
    expect(keysMatch('abc', 'abc')).toBe(true);
    expect(keysMatch('abd', 'abc')).toBe(false);
  });
});

describe('clientIp', () => {
  test('Cloudflare first, then the first forwarded hop, else local', () => {
    expect(
      clientIp(new Headers({ 'cf-connecting-ip': ' 1.2.3.4 ', 'x-forwarded-for': '5.6.7.8' })),
    ).toBe('1.2.3.4');
    expect(clientIp(new Headers({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }))).toBe('5.6.7.8');
    expect(clientIp(new Headers({ 'x-forwarded-for': '' }))).toBe('local');
  });
});

describe('createRateLimiter', () => {
  test('a fixed window per key that starts over after windowMs', () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, clock: { now: () => now } });
    expect([
      limiter.allow('a'),
      limiter.allow('a'),
      limiter.allow('a'),
      limiter.allow('b'),
    ]).toEqual([true, true, false, true]);
    now = 1000;
    expect(limiter.allow('a')).toBe(true);
  });

  test('stale windows are dropped once the table grows', () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 5, windowMs: 1000, clock: { now: () => now } });
    for (let index = 0; index <= 1000; index++) limiter.allow(`ip-${index}`);
    expect(limiter.size()).toBe(1001);
    now = 5000;
    limiter.allow('fresh');
    expect(limiter.size()).toBe(1);
  });
});
