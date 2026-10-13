import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { configJsonSchema, configSchema } from '../config-schema.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');

test('the committed JSON Schema matches the zod schema (run bun run config:schema after a change)', () => {
  expect(readFileSync(join(ROOT, 'codebase.config.schema.json'), 'utf8')).toBe(configJsonSchema());
});

test('the committed example config is valid', () => {
  const example: unknown = JSON.parse(
    readFileSync(join(ROOT, 'codebase.config.example.json'), 'utf8'),
  );
  expect(configSchema.safeParse(example).success).toBe(true);
});
