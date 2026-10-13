/** FastAPI and Flask decorators with their router prefixes, and Django URL confs. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { pythonHttpRoutes } from '../http-routes.ts';

const brief = (routes: readonly RouteDef[]): string[] =>
  routes.map((route) => `${route.line} ${route.method} ${route.pattern} [${route.framework}]`);

describe('FastAPI', () => {
  test('joins APIRouter and include_router prefixes', () => {
    const app = `from fastapi import APIRouter, FastAPI

app = FastAPI(title="orders")
router = APIRouter(prefix="/orders", tags=["orders"])
admin: APIRouter = APIRouter()

@router.get("/{order_id}", response_model=Order)
async def get_order(order_id: int): ...

@router.post("", status_code=201)
async def create_order(payload: NewOrder): ...

@router.api_route("/{order_id}/sync", methods=["PUT", "PATCH"])
async def sync_order(order_id: int): ...

@admin.delete("/orders/{order_id}")
def purge(order_id: int): ...

# @router.get("/legacy")
@app.get("/health")
def health(): ...

app.include_router(router, prefix="/api/v1")
app.include_router(admin)
app.include_router(other.router, prefix="/other")
`;
    expect(brief(pythonHttpRoutes(app))).toEqual([
      '7 GET /api/v1/orders/{order_id} [fastapi]',
      '10 POST /api/v1/orders [fastapi]',
      '13 PUT /api/v1/orders/{order_id}/sync [fastapi]',
      '13 PATCH /api/v1/orders/{order_id}/sync [fastapi]',
      '16 DELETE /orders/{order_id} [fastapi]',
      '20 GET /health [fastapi]',
    ]);
  });
});

describe('Flask', () => {
  test('reads blueprints, methods lists and the default GET', () => {
    const views = `from flask import Blueprint, Flask

app = Flask(__name__)
orders = Blueprint("orders", __name__, url_prefix="/orders")
reports = Blueprint("reports", __name__, url_prefix="/reports")

@orders.route("/<int:order_id>", methods=["GET", "DELETE"])
def order(order_id): ...

@orders.route("/")
def index(): ...

@reports.get("/daily")
def daily(): ...

@app.route(DYNAMIC_PATH)
def dynamic(): ...

app.register_blueprint(orders, url_prefix="/api/orders")
app.register_blueprint(reports)
`;
    expect(brief(pythonHttpRoutes(views))).toEqual([
      '7 GET /api/orders/<int:order_id> [flask]',
      '7 DELETE /api/orders/<int:order_id> [flask]',
      '10 GET /api/orders [flask]',
      '13 GET /reports/daily [flask]',
    ]);
  });

  test('an app imported from elsewhere takes the framework from the imports', () => {
    expect(
      brief(
        pythonHttpRoutes(
          'from flask import jsonify\nfrom app import app\n\n@app.get("/ping")\ndef ping(): ...',
        ),
      ),
    ).toEqual(['4 GET /ping [flask]']);
  });
});

describe('Django', () => {
  test('reads path, re_path and url entries of a URL conf', () => {
    const urls = `from django.urls import include, path, re_path
from . import views

urlpatterns = [
    path("orders/", views.OrderListView.as_view(), name="order-list"),
    path("orders/<int:pk>/", views.order_detail, name="order-detail"),
    re_path(r"^legacy/orders/(?P<pk>[0-9]+)/$", views.legacy_detail),
    url(r'^health/$', views.health),
    path("api/", include("orders.api.urls")),
    path(ROOT, views.index),
]
`;
    expect(brief(pythonHttpRoutes(urls))).toEqual([
      '5 ANY orders/ [django]',
      '6 ANY orders/<int:pk>/ [django]',
      '7 ANY ^legacy/orders/(?P<pk>[0-9]+)/$ [django]',
      '8 ANY ^health/$ [django]',
      '9 ANY api/ [django]',
    ]);
  });

  test('a path() call outside a URL conf is no route', () => {
    expect(pythonHttpRoutes('config = path("settings.toml")')).toEqual([]);
  });
});
