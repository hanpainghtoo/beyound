import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { correlationIdMiddleware } from '@zayos/internal-service-auth';
import { AppModule } from './app.module';
import {
  applyTrustProxy,
  TRUST_PROXY_HOPS_ENV_VAR,
} from './common/config/trust-proxy';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Must run before any middleware that reads `request.ip`, otherwise audit
  // logs record the proxy's loopback address instead of the real client.
  applyTrustProxy(app, process.env[TRUST_PROXY_HOPS_ENV_VAR]);

  app.use(correlationIdMiddleware);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS configuration
  const corsOrigins = (
    process.env.FRONTEND_URLS ||
    process.env.FRONTEND_URL ||
    ''
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin:
      corsOrigins.length > 0
        ? corsOrigins
        : process.env.NODE_ENV === 'production'
          ? false
          : true,
    credentials: true,
  });

  // API prefix
  app.setGlobalPrefix('api/v1');

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Commerce OS API')
    .setDescription('Backend API for Commerce OS')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Platform Admin', 'Platform administration endpoints')
    .addTag('Platform Admin - Billing Accounts', 'Platform billing accounts')
    .addTag('Platform Admin - Top-Up Catalog', 'Platform top-up catalog')
    .addTag('Platform Admin - Top-Up Purchases', 'Operator top-up purchases')
    .addTag(
      'Platform Admin - Subscription Entitlement',
      'Operator subscription entitlement',
    )
    .addTag('Platform Admin - Channel Templates', 'Channel templates')
    .addTag('Tenant - Subscription Periods', 'Workspace subscription periods')
    .addTag('Tenant - Top-Up Catalog', 'Workspace top-up catalog')
    .addTag('Tenant - Top-Up Purchases', 'Workspace top-up purchases')
    .addTag('Public Billing', 'Public billing accounts')
    .addTag('Public Catalog', 'Public subscription plans')
    .addTag('Media Library', 'Media and billing-proof uploads')
    .addTag('Tenant Management', 'Tenant management endpoints')
    .addTag('Commerce Workspace', 'Commerce Workspace endpoints')
    .addTag('Authentication', 'Authentication endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);

  console.log(`Commerce OS backend running on ${host}:${port}`);
  console.log(
    `📚 API Documentation available at http://localhost:${port}/api/docs`,
  );
}

void bootstrap();
