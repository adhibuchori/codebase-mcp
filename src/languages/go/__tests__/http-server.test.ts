/** Tests for Go router handlers: gin, echo, fiber, chi, gorilla/mux and net/http. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { goServerRoutes } from '../http-server.ts';
import { maskSource } from '../syntax.ts';

const summary = (code: string): string[] =>
  goServerRoutes(maskSource(code)).map(
    (r: RouteDef) => `${r.line} ${r.method} ${r.pattern} ${r.framework}`,
  );

describe('goServerRoutes on gin and echo', () => {
  test('resolves group prefixes per variable, nested groups included', () => {
    const gin = `package main

import "github.com/gin-gonic/gin"

func main() {
	r := gin.Default()
	r.GET("/health", health)
	// r.GET("/commented-out", nope)
	api := r.Group("/api")
	v1 := api.Group("/v1")
	{
		v1.GET("/orders/:id", getOrder)
		v1.POST("/orders", createOrder)
		orders := v1.Group("/orders")
		orders.DELETE("/:id", deleteOrder)
		orders.GET("", listOrders)
	}
	r.Any("/proxy/*path", proxy)
	r.Handle(http.MethodPatch, "/legacy", legacy)
}
`;
    expect(summary(gin)).toEqual([
      '7 GET /health gin',
      '12 GET /api/v1/orders/:id gin',
      '13 POST /api/v1/orders gin',
      '15 DELETE /api/v1/orders/:id gin',
      '16 GET /api/v1/orders gin',
      '18 ANY /proxy/*path gin',
      '19 PATCH /legacy gin',
    ]);
  });

  test('labels echo routes, groups and Add calls', () => {
    const echo = `package main

import "github.com/labstack/echo/v4"

func main() {
	e := echo.New()
	admin := e.Group("/admin", middleware.BasicAuth(validate))
	admin.GET("/users/:id", getUser)
	e.Add("PUT", "/users/:id", updateUser)
}
`;
    expect(summary(echo)).toEqual(['8 GET /admin/users/:id echo', '9 PUT /users/:id echo']);
  });
});

describe('goServerRoutes on chi and fiber', () => {
  test('lends a Route block prefix to the routes inside its braces only', () => {
    const chi = `package api

import "github.com/go-chi/chi/v5"

func Router() http.Handler {
	r := chi.NewRouter()
	r.Get("/", index)
	r.Route("/articles", func(r chi.Router) {
		r.With(paginate).Get("/", listArticles)
		r.Post("/", createArticle)
		r.Route("/{articleID}", func(r chi.Router) {
			r.Use(ArticleCtx)
			r.Get("/", getArticle)
			r.Method(http.MethodPut, "/", updateArticle)
		})
	})
	r.Get("/after", after)
	r.HandleFunc("/ws", websocket)
	return r
}
`;
    expect(summary(chi)).toEqual([
      '7 GET / chi',
      '9 GET /articles chi',
      '10 POST /articles chi',
      '13 GET /articles/{articleID} chi',
      '14 PUT /articles/{articleID} chi',
      '17 GET /after chi',
      '18 ANY /ws chi',
    ]);
  });

  test('reads fiber groups, Route blocks and All', () => {
    const fiber = `package main

import "github.com/gofiber/fiber/v2"

func main() {
	app := fiber.New()
	api := app.Group("/api", logger.New())
	api.Route("/orders", func(orders fiber.Router) {
		orders.Get("/:id", getOrder)
	})
	app.All("/proxy", proxy)
}
`;
    expect(summary(fiber)).toEqual(['9 GET /api/orders/:id fiber', '11 ANY /proxy fiber']);
  });
});

describe('goServerRoutes on gorilla/mux and net/http', () => {
  test('reads gorilla subrouters and Methods on the same or the next line', () => {
    const gorilla = `package main

import (
	"net/http"

	"github.com/gorilla/mux"
)

func main() {
	r := mux.NewRouter()
	r.HandleFunc("/products/{id}", getProduct).Methods("GET")
	api := r.PathPrefix("/api").Subrouter()
	api.HandleFunc("/orders/{id}", h.GetOrder).
		Methods(http.MethodGet, http.MethodHead)
	api.Handle("/metrics", promhttp.Handler())
	http.HandleFunc("/healthz", healthz)
}
`;
    expect(summary(gorilla)).toEqual([
      '11 GET /products/{id} gorilla',
      '13 GET /api/orders/{id} gorilla',
      '13 HEAD /api/orders/{id} gorilla',
      '15 ANY /api/metrics gorilla',
      '16 ANY /healthz net-http',
    ]);
  });

  test("keeps net/http patterns as written and reads Go 1.22's verb prefix", () => {
    const std = `package main

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /orders/{id}", getOrder)
	mux.HandleFunc("POST /orders", createOrder)
	mux.Handle("/static/", http.StripPrefix("/static/", files))
}
`;
    expect(summary(std)).toEqual([
      '5 GET /orders/{id} net-http',
      '6 POST /orders net-http',
      '7 ANY /static/ net-http',
    ]);
  });

  test('guesses the router from the call shape when the file imports none', () => {
    const routes = `func register(r Router, e Echo, m Mux) {
	r.POST("/payments", pay)
	m.Get("/refunds", refund)
	e.Add("DELETE", "/payments/:id", cancel)
	m.MethodFunc("GET", "/refunds/{id}", show)
	r.Handle("OPTIONS", "/payments", preflight)
}
`;
    expect(summary(routes)).toEqual([
      '2 POST /payments gin',
      '3 GET /refunds chi',
      '4 DELETE /payments/:id echo',
      '5 GET /refunds/{id} chi',
      '6 OPTIONS /payments gin',
    ]);
  });
});
