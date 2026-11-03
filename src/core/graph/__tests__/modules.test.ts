import { expect, test } from 'bun:test';
import { moduleBase, moduleMatch, resolveRelative } from '../modules.ts';

test('a module base drops the extension and a trailing index', () => {
  expect(moduleBase('src/api/payments.ts')).toBe('src/api/payments');
  expect(moduleBase('src/ui/index.tsx')).toBe('src/ui');
  expect(moduleBase('types/global.d.ts')).toBe('types/global');
});

test('relative specifiers resolve from the importing folder, never out of the repo', () => {
  expect(resolveRelative('./clients/orders', 'src/server.ts')).toBe('src/clients/orders');
  expect(resolveRelative('../api/payments.js', 'src/screens/a.tsx')).toBe('src/api/payments');
  expect(resolveRelative('../../x', 'src/a.ts')).toBeNull();
});

test('relative imports match exactly in the same repo only', () => {
  const target = { repo: 'web', path: 'src/api/payments.ts' };
  expect(moduleMatch('../api/payments', { repo: 'web', path: 'src/screens/a.tsx' }, target)).toBe(
    'exact',
  );
  expect(
    moduleMatch('../api/other', { repo: 'web', path: 'src/screens/a.tsx' }, target),
  ).toBeNull();
  expect(
    moduleMatch('../api/payments', { repo: 'app', path: 'src/screens/a.tsx' }, target),
  ).toBeNull();
});

test('aliases match by path suffix, packages by repo name; both are only likely', () => {
  const target = { repo: 'web', path: 'src/api/payments.ts' };
  const from = { repo: 'web', path: 'src/screens/a.tsx' };
  expect(moduleMatch('@/api/payments', from, target)).toBe('likely');
  expect(moduleMatch('src/api/payments', from, target)).toBe('likely');
  expect(moduleMatch('lodash', from, target)).toBeNull();
  const shared = { repo: 'design-system', path: 'src/badge.tsx' };
  expect(moduleMatch('@acme/design-system', from, shared)).toBe('likely');
  expect(moduleMatch('design-system/badge', from, shared)).toBe('likely');
  expect(moduleMatch('@acme/other', from, shared)).toBeNull();
});
