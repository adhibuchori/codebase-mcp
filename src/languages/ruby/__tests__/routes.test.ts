/** Rails routes with namespaces, scopes and resources; Sinatra handlers; request specs read nothing. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { rubyRoutes } from '../routes.ts';

const brief = (routes: readonly RouteDef[]): string[] =>
  routes.map((route) => `${route.line} ${route.method} ${route.pattern} [${route.framework}]`);

describe('Rails', () => {
  test('reads verbs, match, root and resources inside namespaces and scopes', () => {
    const routes = `Rails.application.routes.draw do
  root 'home#index'
  get 'up', to: 'rails/health#show'

  namespace :api do
    scope path: '/v1' do
      resources :orders, only: [:index, :show] do
        post 'cancel', to: 'orders#cancel'
      end
      match 'webhooks/:provider', to: 'webhooks#receive', via: [:get, :post]
      match 'echo', to: 'echo#show', via: :all
      # get 'legacy', to: 'legacy#index'
    end
  end
end
`;
    expect(brief(rubyRoutes(routes))).toEqual([
      '2 GET / [rails]',
      '3 GET up [rails]',
      '7 GET /api/v1/orders [rails]',
      '7 GET /api/v1/orders/:id [rails]',
      '8 POST /api/v1/orders/:order_id/cancel [rails]',
      '10 GET /api/v1/webhooks/:provider [rails]',
      '10 POST /api/v1/webhooks/:provider [rails]',
      '11 ANY /api/v1/echo [rails]',
    ]);
  });

  test('a scope without a path adds no prefix', () => {
    const routes =
      "Rails.application.routes.draw do\n  scope module: 'admin' do\n    delete 'cache', to: 'cache#clear'\n  end\nend";
    expect(brief(rubyRoutes(routes))).toEqual(['3 DELETE cache [rails]']);
  });
});

describe('Sinatra', () => {
  test('reads handlers and namespaces', () => {
    const app = `require 'sinatra/base'
require 'sinatra/namespace'

class OrdersApp < Sinatra::Base
  register Sinatra::Namespace

  get '/health' do
    'ok'
  end

  namespace '/api' do
    get '/orders/:id' do |id|
      json Order.find(id)
    end
    match('/orders', via: :options) { 200 }
  end
end
`;
    expect(brief(rubyRoutes(app))).toEqual([
      '7 GET /health [sinatra]',
      '12 GET /api/orders/:id [sinatra]',
      '15 OPTIONS /api/orders [sinatra]',
    ]);
  });
});

describe('other Ruby files', () => {
  test('a request spec is not a routes file', () => {
    const spec =
      "RSpec.describe 'Orders', type: :request do\n  it 'shows an order' do\n    get '/orders/1'\n  end\nend";
    expect(rubyRoutes(spec)).toEqual([]);
  });
});
