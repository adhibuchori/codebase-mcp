/**
 * Every route a C# file declares: attribute-routed controllers, minimal APIs, HttpClient and Refit
 * calls, Kafka and MassTransit topics, and gRPC services and clients. The source is masked once and
 * shared by the extractors.
 */
import type { RouteExtractor } from '../../core/model/language-pack.types.ts';
import { controllerRoutes } from './controllers.ts';
import { httpClientCalls } from './http-client.ts';
import { csharpMessaging } from './messaging.ts';
import { minimalApiRoutes } from './minimal-api.ts';
import { maskSource } from './syntax.ts';

export const aspnetRoutes: RouteExtractor = (text) => {
  const source = maskSource(text);
  return [
    ...controllerRoutes(source),
    ...minimalApiRoutes(source.code),
    ...httpClientCalls(source.code),
    ...csharpMessaging(source),
  ].toSorted((a, b) => a.line - b.line);
};
