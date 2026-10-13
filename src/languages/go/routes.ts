/**
 * Every route a Go file declares: handlers on gin, echo, fiber, chi, gorilla/mux and net/http,
 * outgoing net/http calls, Kafka topics (kafka-go, sarama, confluent-kafka-go) and grpc-go
 * services. The source is masked once and shared by the three extractors.
 */
import type { RouteExtractor } from '../../core/model/language-pack.types.ts';
import { goClientCalls } from './http-client.ts';
import { goServerRoutes } from './http-server.ts';
import { goMessaging } from './messaging.ts';
import { maskSource } from './syntax.ts';

export const goRoutes: RouteExtractor = (text) => {
  const source = maskSource(text);
  return [
    ...goServerRoutes(source),
    ...goClientCalls(source.code),
    ...goMessaging(source),
  ].toSorted((a, b) => a.line - b.line);
};
