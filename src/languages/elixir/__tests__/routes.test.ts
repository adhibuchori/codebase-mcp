/** Phoenix router routes, resources and forwards, prefixed by their scopes. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { elixirRoutes } from '../routes.ts';

describe('elixirRoutes', () => {
  test('reads a Phoenix router', () => {
    const router = `defmodule ShopWeb.Router do
  use ShopWeb, :router

  scope "/", ShopWeb do
    pipe_through :browser
    live "/orders", OrderLive.Index, :index
  end

  scope "/api", ShopWeb.Api, as: :api do
    pipe_through :api
    get "/orders/:id", OrderController, :show
    post "/orders", OrderController, :create
    resources "/users", UserController, only: [:index, :show]
    # delete "/orders/:id", OrderController, :delete
  end

  forward "/admin", ShopWeb.AdminRouter
end
`;
    expect(
      elixirRoutes(router).map(
        (route: RouteDef) => `${route.line} ${route.method} ${route.pattern} [${route.framework}]`,
      ),
    ).toEqual([
      '6 GET /orders [phoenix]',
      '11 GET /api/orders/:id [phoenix]',
      '12 POST /api/orders [phoenix]',
      '13 GET /api/users [phoenix]',
      '13 GET /api/users/:id [phoenix]',
      '17 ANY /admin [phoenix]',
    ]);
  });
});
