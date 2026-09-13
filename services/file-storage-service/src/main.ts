import { NestFactory } from '@nestjs/core';
import {
  correlationIdMiddleware,
  validateInternalServiceAuthEnv,
} from '@zayos/internal-service-auth';
import { raw } from 'express';
import { AppModule } from './app.module';
import { getFileStorageCorsOptions } from './cors.config';
import { StructuredExceptionFilter } from './structured-exception.filter';

async function bootstrap() {
  validateInternalServiceAuthEnv({
    ...process.env,
    SERVICE_IDENTITY: 'file-storage-service',
  });
  const app = await NestFactory.create(AppModule);
  app.use(correlationIdMiddleware);
  app.use(
    '/files/:id/content',
    raw({ type: '*/*', limit: process.env.MAX_FILE_SIZE || '10mb' }),
  );
  app.useGlobalFilters(new StructuredExceptionFilter());
  app.enableCors(getFileStorageCorsOptions());
  await app.listen(process.env.PORT ?? 3000, process.env.HOST || '127.0.0.1');
}
void bootstrap();
