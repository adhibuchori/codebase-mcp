import { expect, test } from 'bun:test';
import type { RefHit } from '../../model/graph.types.ts';
import { judgeUse, type CallerSite, type GraphTarget } from '../judge.ts';

const ref = (fields: Partial<RefHit>): RefHit => ({
  kind: 'call',
  name: 'refund',
  receiver: 'x',
  scope: '',
  line: 3,
  origin: 'Caller.run',
  repo: 'shop',
  path: 'src/Caller.java',
  ...fields,
});

const javaTarget: GraphTarget = {
  repo: 'shop',
  path: 'src/CardRefunds.java',
  container: 'CardRefunds',
  style: 'packages',
  owner: 'com.acme.CardRefunds',
  supertypes: new Set(['com.acme.Refunds']),
};

const site = (fields: Partial<RefHit>, supers: readonly string[] = []): CallerSite => ({
  ref: ref(fields),
  style: 'packages',
  supertypes: () => new Set(supers),
});

test('packages: own class, a supertype, an inherited call, an open package, or by name', () => {
  expect(judgeUse(javaTarget, site({ scope: 'com.acme.CardRefunds' }))).toEqual({
    confidence: 'exact',
    via: '',
  });
  expect(judgeUse(javaTarget, site({ scope: 'com.acme.Refunds' }))).toEqual({
    confidence: 'exact',
    via: 'Refunds',
  });
  expect(
    judgeUse(javaTarget, site({ receiver: '', scope: 'com.acme.Quick' }, ['com.acme.CardRefunds'])),
  ).toEqual({ confidence: 'exact', via: 'inherited' });
  expect(judgeUse(javaTarget, site({ receiver: '', scope: 'com.acme.Quick' }))).toBeNull();
  expect(judgeUse(javaTarget, site({ scope: '?CardRefunds' }))).toEqual({
    confidence: 'likely',
    via: '',
  });
  expect(
    judgeUse({ ...javaTarget, container: 'Outer.CardRefunds' }, site({ scope: '?CardRefunds' }))
      ?.confidence,
  ).toBe('likely');
  expect(judgeUse(javaTarget, site({ scope: '?Other' }))).toBeNull();
  expect(judgeUse(javaTarget, site({ scope: '' }))).toEqual({ confidence: 'name', via: '' });
  expect(judgeUse(javaTarget, site({ scope: 'org.Other' }))).toBeNull();
});

test('another language matches by name when it has no graph, and never across graph styles', () => {
  expect(judgeUse(javaTarget, { ...site({}), style: null })?.confidence).toBe('name');
  expect(judgeUse(javaTarget, { ...site({}), style: 'modules' })).toBeNull();
});

const tsTarget: GraphTarget = {
  repo: 'web',
  path: 'src/api/payments.ts',
  container: '',
  style: 'modules',
  owner: '',
  supertypes: new Set(),
};

const tsSite = (fields: Partial<RefHit>): CallerSite => ({
  ref: ref({ repo: 'web', path: 'src/screens/a.tsx', ...fields }),
  style: 'modules',
  supertypes: () => new Set(),
});

test('modules: plain calls in the file, own types, imported modules and types, or by name', () => {
  const inFile = { path: 'src/api/payments.ts', receiver: '' };
  expect(judgeUse(tsTarget, tsSite({ ...inFile, scope: '' }))?.confidence).toBe('exact');
  expect(judgeUse(tsTarget, tsSite({ receiver: '', scope: '' }))).toBeNull();
  expect(judgeUse(tsTarget, tsSite({ scope: '' }))?.confidence).toBe('name');
  expect(judgeUse(tsTarget, tsSite({ scope: '../api/payments' }))?.confidence).toBe('exact');
  expect(judgeUse(tsTarget, tsSite({ scope: '@/api/payments' }))?.confidence).toBe('likely');
  expect(judgeUse(tsTarget, tsSite({ scope: '../api/other' }))).toBeNull();
  expect(judgeUse(tsTarget, tsSite({ scope: '../api/payments#Api' }))).toBeNull();
  const method = { ...tsTarget, container: 'Api' };
  expect(judgeUse(method, tsSite({ scope: '../api/payments#Api' }))?.confidence).toBe('exact');
  expect(judgeUse(method, tsSite({ scope: '../api/payments' }))).toBeNull();
  expect(judgeUse(method, tsSite({ ...inFile, scope: '#Api' }))?.confidence).toBe('exact');
  expect(judgeUse(method, tsSite({ scope: '#Api' }))).toBeNull();
});

test('types: a bare type name is exact in its own repo and likely in another', () => {
  const swift: GraphTarget = {
    ...javaTarget,
    style: 'types',
    owner: 'CardRefunds',
    supertypes: new Set(),
  };
  const typed = (repo: string): CallerSite => ({
    ...site({ scope: 'CardRefunds', repo }),
    style: 'types',
  });
  expect(judgeUse(swift, typed('shop'))?.confidence).toBe('exact');
  expect(judgeUse(swift, typed('other'))?.confidence).toBe('likely');
  expect(
    judgeUse({ ...swift, container: '' }, { ...site({ receiver: '', scope: 'X' }), style: 'types' })
      ?.confidence,
  ).toBe('likely');
});
