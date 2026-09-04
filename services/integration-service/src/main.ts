import { NestFactory } from '@nestjs/core';
import {
  correlationIdMiddleware,
  validateInternalServiceAuthEnv,
} from '@zayos/internal-service-auth';
import { AppModule } from './app.module';
import { StructuredExceptionFilter } from './structured-exception.filter';

async function bootstrap() {
  validateInternalServiceAuthEnv({ ...process.env, SERVICE_IDENTITY: 'integration-service' });
  const app = await NestFactory.create(AppModule);
  app.use(correlationIdMiddleware);
  app.useGlobalFilters(new StructuredExceptionFilter());
  await app.listen(process.env.PORT ?? 3000, process.env.HOST || '127.0.0.1');
}
bootstrap();
