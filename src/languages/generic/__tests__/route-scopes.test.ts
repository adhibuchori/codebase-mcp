/** Indentation scopes and prefix joining, as Rails, Phoenix, Laravel and proto files use them. */
import { describe, expect, test } from 'bun:test';
import { scopedLines, scopePrefix, withPrefix } from '../route-scopes.ts';

const opensNamespace = (line: string): string | undefined =>
  /^\s*namespace :(\w+) do/.exec(line)?.[1];

describe('scopedLines', () => {
  test('a scope encloses the lines indented deeper than its opening line', () => {
    const routes = [
      'Rails.application.routes.draw do',
      '  namespace :api do',
      '    namespace :v1 do',
      "      get 'orders', to: 'orders#index'",
      '',
      "      get 'orders/:id', to: 'orders#show'",
      '    end',
      "    get 'health', to: 'health#show'",
      '  end',
      "  get 'up', to: 'rails/health#show'",
      'end',
    ].join('\n');
    const scoped = scopedLines(routes, opensNamespace);
    /* An `end` sits at its opener's indentation, so it is already outside that scope. */
    expect(scoped.map((line) => line.scopes.join('/'))).toEqual([
      '',
      '',
      'api',
      'api/v1',
      'api/v1',
      'api/v1',
      'api',
      'api',
      '',
      '',
      '',
    ]);
    expect(scoped[3]).toEqual({
      text: "      get 'orders', to: 'orders#index'",
      line: 4,
      scopes: ['api', 'v1'],
    });
  });
});

describe('prefixes', () => {
  test('withPrefix keeps a path as declared without a prefix and joins it otherwise', () => {
    expect(withPrefix('', 'orders/:id')).toBe('orders/:id');
    expect(withPrefix('/api', 'orders/:id')).toBe('/api/orders/:id');
    expect(withPrefix('/api', '')).toBe('/api');
  });

  test('scopePrefix joins nested scopes and ignores empty ones', () => {
    expect(scopePrefix([])).toBe('');
    expect(scopePrefix(['api', '', 'v1'])).toBe('/api/v1');
    expect(scopePrefix(['/'])).toBe('/');
  });
});
