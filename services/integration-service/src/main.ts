import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  correlationIdMiddleware,
  validateInternalServiceAuthEnv,
} from '@zayos/internal-service-auth';
import { AppModule } from './app.module';
import { StructuredExceptionFilter } from './structured-exception.filter';

/**
 * Outbound media ships as base64 inside the JSON dispatch payload (core cannot
 * hand providers our localhost-bound signed URLs), which inflates every byte
 * by 4/3. Body-parser's default 100kb therefore rejected any attachment over
 * ~75KB with a bare "request entity too large" 500 — the send never reached
 * the provider client, so the bubble showed only a generic failure. 15mb
 * covers a 10MB provider photo plus encoding overhead; the per-type size guard
 * in telegram.client.ts is what rejects genuinely oversized files with a
 * message an agent can act on.
 */
const JSON_BODY_LIMIT = '15mb';

async function bootstrap() {
  validateInternalServiceAuthEnv({ ...process.env, SERVICE_IDENTITY: 'integration-service' });
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: JSON_BODY_LIMIT, extended: true });
  app.use(correlationIdMiddleware);
  app.useGlobalFilters(new StructuredExceptionFilter());
  await app.listen(process.env.PORT ?? 3000, process.env.HOST || '127.0.0.1');
}
bootstrap();
