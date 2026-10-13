/** Laravel route files with their group prefixes, merged with Symfony routes in line order. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { phpRoutes } from '../routes.ts';

const brief = (routes: readonly RouteDef[]): string[] =>
  routes.map((route) => `${route.line} ${route.method} ${route.pattern} [${route.framework}]`);

describe('Laravel', () => {
  test('reads verbs, match and any, with nested group prefixes', () => {
    const api = `<?php

use App\\Http\\Controllers\\OrderController;
use Illuminate\\Support\\Facades\\Route;

Route::get('/health', fn () => response()->json(['ok' => true]));

Route::prefix('v1')->middleware('auth:sanctum')->group(function () {
    Route::get('/orders/{order}', [OrderController::class, 'show']);
    Route::match(['put', 'patch'], '/orders/{order}', [OrderController::class, 'update']);
    Route::group(['prefix' => 'admin'], function () {
        Route::delete('orders/{order}', [OrderController::class, 'destroy']);
    });
    Route::middleware('throttle:10,1')->post('/orders', [OrderController::class, 'store']);
    // Route::get('/orders/legacy', [OrderController::class, 'legacy']);
});

Route::middleware('auth')->group(function () {
    Route::any('/webhooks/payments', PaymentWebhookController::class);
    Route::get($dynamicPath, DynamicController::class);
});
`;
    expect(brief(phpRoutes(api))).toEqual([
      '6 GET /health [laravel]',
      '9 GET /v1/orders/{order} [laravel]',
      '10 PUT /v1/orders/{order} [laravel]',
      '10 PATCH /v1/orders/{order} [laravel]',
      '12 DELETE /v1/admin/orders/{order} [laravel]',
      '14 POST /v1/orders [laravel]',
      '19 ANY /webhooks/payments [laravel]',
    ]);
  });

  test('ignores request lookups that look like routes', () => {
    expect(
      phpRoutes("$id = $request->get('id');\n// Route::prefix('x')->group(function () {"),
    ).toEqual([]);
  });
});

describe('phpRoutes', () => {
  test('includes Symfony routes', () => {
    const controller =
      "#[Route('/orders/{id}', methods: ['GET'])]\npublic function show(int $id): Response {}";
    expect(brief(phpRoutes(controller))).toEqual(['1 GET /orders/{id} [symfony]']);
  });
});
