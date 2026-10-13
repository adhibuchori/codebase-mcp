/** Symfony attribute and annotation routes, with the class route as their prefix. */
import { describe, expect, test } from 'bun:test';
import type { RouteDef } from '../../../core/model/domain.types.ts';
import { symfonyRoutes } from '../symfony-routes.ts';

const brief = (routes: readonly RouteDef[]): string[] =>
  routes.map((route) => `${route.line} ${route.method} ${route.pattern} [${route.framework}]`);

describe('symfonyRoutes', () => {
  test('prefixes attribute routes with the class route', () => {
    const controller = `<?php

namespace App\\Controller;

#[Route('/api/orders', name: 'orders_')]
#[IsGranted('ROLE_USER')]
final class OrderController extends AbstractController
{
    #[Route('/{id}', name: 'show', methods: ['GET'])]
    public function show(int $id): JsonResponse {}

    #[Route(name: 'create', path: '', methods: ['POST'])]
    public function create(Request $request): JsonResponse {}

    #[Route('/{id}/history')]
    public function history(int $id): JsonResponse {}

    // #[Route('/{id}/legacy')]
}
`;
    expect(brief(symfonyRoutes(controller))).toEqual([
      '9 GET /api/orders/{id} [symfony]',
      '12 POST /api/orders [symfony]',
      '15 ANY /api/orders/{id}/history [symfony]',
    ]);
  });

  test('reads docblock annotations', () => {
    const controller = `<?php

/**
 * @Route("/invoices")
 */
class InvoiceController extends AbstractController
{
    /**
     * @Route("/{id}", name="invoice_show", methods={"GET", "HEAD"})
     */
    public function show(int $id): Response {}

    /** @Route */
    public function untouched(): void {}
}
`;
    expect(brief(symfonyRoutes(controller))).toEqual([
      '9 GET /invoices/{id} [symfony]',
      '9 HEAD /invoices/{id} [symfony]',
    ]);
  });
});
