import { describe, expect, test } from 'bun:test';
import { redactSecrets } from '../redact.ts';

/* Every fake secret is built at runtime, so no source line holds something a scanner would flag. */
const repeat = (char: string, count: number): string => char.repeat(count);

describe('redactSecrets', () => {
  test('masks well-known token shapes', () => {
    const tokens = [
      `AKIA${repeat('Z', 16)}`,
      `ghp_${repeat('a', 36)}`,
      `github_pat_${repeat('b', 40)}`,
      `xoxb-${repeat('1', 12)}`,
      `AIza${repeat('c', 35)}`,
      `sk_live_${repeat('d', 24)}`,
      `sk-${repeat('e', 40)}`,
      `eyJ${repeat('f', 10)}.eyJ${repeat('g', 10)}.${repeat('h', 12)}`,
    ];
    for (const token of tokens)
      expect(redactSecrets(`value = ${token};`)).toBe('value = [REDACTED];');
  });

  test('masks private key blocks', () => {
    /* Built from parts so the secret scanner does not flag this fake key. */
    const fence = (edge: string): string => `-----${edge} RSA PRIVATE KEY-----`;
    const block = [fence('BEGIN'), repeat('x', 40), fence('END')].join('\n');
    expect(redactSecrets(block)).toBe('-----BEGIN PRIVATE KEY----- [REDACTED]');
  });

  test('keeps the key of a secret assignment and drops the value', () => {
    expect(redactSecrets(`password = "${repeat('p', 10)}"`)).toBe('password = "[REDACTED]"');
    expect(redactSecrets(`apiKey: '${repeat('k', 8)}'`)).toBe("apiKey: '[REDACTED]'");
    expect(redactSecrets(`DB_SECRET="${repeat('s', 12)}"`)).toBe('DB_SECRET="[REDACTED]"');
  });

  test('masks credentials inside connection strings', () => {
    expect(redactSecrets(`postgres://app:${repeat('w', 10)}@db:5432/orders`)).toBe(
      'postgres://app:[REDACTED]@db:5432/orders',
    );
  });

  test('leaves ordinary code alone', () => {
    const code = 'const password = input.value; // no literal\nreturn token.length > 3;';
    expect(redactSecrets(code)).toBe(code);
  });
});
