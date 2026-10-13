import { describe, expect, test } from 'bun:test';
import { BUILD_DIRS, IGNORED_DIRS, isSensitiveName } from '../sensitive-name.ts';

/* Env file names are assembled at runtime so no test source line names one literally. */
const env = (suffix: string): string => `.env${suffix}`;

describe('env files are always blocked', () => {
  test.each([
    env(''),
    '.ENV',
    env('.local'),
    env('.production'),
    env('.example'),
    env('.sample'),
    env('-prod'),
    env('_backup'),
    env('rc'),
    'prod.env',
    'app.env',
    'config.env.bak',
  ])('%s', (name) => expect(isSensitiveName(name)).toBe(true));
});

describe('Windows tricks that open an env file are blocked', () => {
  test.each([env('.'), env(' '), env('::$DATA'), env('.local:stream'), 'x:.env'])('%s', (name) =>
    expect(isSensitiveName(name)).toBe(true),
  );
});

describe('other secrets stay blocked', () => {
  test.each([
    'server.pem',
    'private.key',
    'id_rsa',
    'id_ed25519.pub',
    '.npmrc',
    'credentials.json',
    'client_secret.json',
    'application-prod.yml',
    'GoogleService-Info.plist',
    'key.pem.',
  ])('%s', (name) => expect(isSensitiveName(name)).toBe(true));
});

describe('normal source files are allowed', () => {
  test.each([
    'env.js',
    'server.js',
    'README.md',
    'vite-env.d.ts',
    'dotenv.config.js',
    'environment.ts',
    'x.envelope',
    'package.json',
    'Dockerfile',
  ])('%s', (name) => expect(isSensitiveName(name)).toBe(false));
});

test('extra patterns from the config are applied', () => {
  expect(isSensitiveName('dump.sql', [/\.sql$/i])).toBe(true);
  expect(isSensitiveName('schema.prisma', [/\.sql$/i])).toBe(false);
});

test('dependency and build folders are known', () => {
  expect(IGNORED_DIRS.has('node_modules')).toBe(true);
  expect(IGNORED_DIRS.has('.git')).toBe(true);
  expect(BUILD_DIRS.has('target')).toBe(true);
});
