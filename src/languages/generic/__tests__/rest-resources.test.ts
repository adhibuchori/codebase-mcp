/** A resource declaration expands to the conventional REST routes, narrowed by only/except. */
import { describe, expect, test } from 'bun:test';
import { resourceRoutes } from '../rest-resources.ts';

const brief = (base: string, options: string): string[] =>
  resourceRoutes(base, options).map((route) => `${route.method} ${route.path}`);

describe('resourceRoutes', () => {
  test('lists every action without a filter', () => {
    expect(brief('/orders', '')).toEqual([
      'GET /orders',
      'GET /orders/new',
      'POST /orders',
      'GET /orders/:id',
      'GET /orders/:id/edit',
      'PATCH /orders/:id',
      'PUT /orders/:id',
      'DELETE /orders/:id',
    ]);
  });

  test('keeps only the listed actions', () => {
    expect(brief('/orders', ', only: [:index, :show]')).toEqual(['GET /orders', 'GET /orders/:id']);
    expect(brief('/orders', ', only: :show')).toEqual(['GET /orders/:id']);
  });

  test('drops the excepted actions, in either list syntax', () => {
    expect(brief('/users', ', except: %i[new edit destroy]')).toEqual([
      'GET /users',
      'POST /users',
      'GET /users/:id',
      'PATCH /users/:id',
      'PUT /users/:id',
    ]);
    expect(brief('/users', ', UserController, except: [:new, :edit]')).toHaveLength(6);
  });
});
