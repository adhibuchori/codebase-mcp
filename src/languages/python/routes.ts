/**
 * The route extractor of the Python pack: FastAPI, Flask and Django handlers, requests/httpx calls,
 * Kafka topics and gRPC services, in line order.
 */
import type { RouteExtractor } from '../../core/model/language-pack.types.ts';
import { pythonClientCalls } from './client-calls.ts';
import { pythonHttpRoutes } from './http-routes.ts';
import { pythonMessaging } from './messaging.ts';

export const pythonRoutes: RouteExtractor = (text) =>
  [...pythonHttpRoutes(text), ...pythonClientCalls(text), ...pythonMessaging(text)].toSorted(
    (a, b) => a.line - b.line,
  );
