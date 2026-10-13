/**
 * The route extractor of the JavaScript and TypeScript packs: HTTP handlers (Express, Koa, Hono,
 * Fastify, NestJS), outgoing HTTP calls (axios, fetch, got, ky), Kafka topics (kafkajs, NestJS
 * microservices) and gRPC services (@grpc/grpc-js), in line order. Next.js file-system routes are
 * out of scope: their path is the file's, not text in it.
 */
import type { RouteExtractor } from '../../core/model/language-pack.types.ts';
import { clientCalls } from './client-calls.ts';
import { messagingRoutes } from './messaging.ts';
import { nestRoutes } from './nest-routes.ts';
import { serverRoutes } from './server-routes.ts';

export const nodeRoutes: RouteExtractor = (text) =>
  [
    ...serverRoutes(text),
    ...nestRoutes(text),
    ...clientCalls(text),
    ...messagingRoutes(text),
  ].toSorted((a, b) => a.line - b.line);
