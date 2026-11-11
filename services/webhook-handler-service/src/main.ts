import { NestFactory } from '@nestjs/core';
import {
  correlationIdMiddleware,
  validateInternalServiceAuthEnv,
} from '@zayos/internal-service-auth';
import { AppModule } from './app.module';
import { StructuredExceptionFilter } from './structured-exception.filter';

async function bootstrap() {
  validateInternalServiceAuthEnv({
    ...process.env,
    SERVICE_IDENTITY: 'webhook-handler-service',
  });
  await validateTelegramManagerEnv();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(correlationIdMiddleware);
  app.useGlobalFilters(new StructuredExceptionFilter());
  await app.listen(process.env.PORT ?? 3000, process.env.HOST || '127.0.0.1');
}
void bootstrap();

async function validateTelegramManagerEnv() {
  if (process.env.NODE_ENV !== 'production') return;
  const required = [
    'TELEGRAM_MANAGER_BOT_TOKEN',
    'TELEGRAM_MANAGER_BOT_USERNAME',
    'TELEGRAM_MANAGER_WEBHOOK_SECRET',
    'TELEGRAM_MANAGER_WEBHOOK_URL',
    'TELEGRAM_MERCHANT_WEBHOOK_BASE_URL',
  ];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    logTelegramManagerStartupWarning('TELEGRAM_MANAGER_MISCONFIGURED');
    return;
  }

  const apiBase = (
    process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org'
  ).replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetch(
      `${apiBase}/bot${encodeURIComponent(process.env.TELEGRAM_MANAGER_BOT_TOKEN || '')}/getMe`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
    );
  } catch {
    logTelegramManagerStartupWarning('TELEGRAM_MANAGER_UNAVAILABLE');
    return;
  }
  const body = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: { username?: string; can_manage_bots?: boolean };
  };
  const username = (
    process.env.TELEGRAM_MANAGER_BOT_USERNAME || 'ZayOSManagerBot'
  ).replace(/^@/, '');
  if (!response.ok || body.ok !== true) {
    logTelegramManagerStartupWarning('TELEGRAM_MANAGER_UNAVAILABLE');
    return;
  }
  if (
    body.result?.username &&
    body.result.username.toLowerCase() !== username.toLowerCase()
  ) {
    logTelegramManagerStartupWarning('TELEGRAM_MANAGER_USERNAME_MISMATCH');
    return;
  }
  if (body.result?.can_manage_bots !== true) {
    logTelegramManagerStartupWarning(
      'TELEGRAM_MANAGER_BOT_MANAGEMENT_DISABLED',
      `Telegram bot management is not enabled for @${username}. Enable management of other bots in the BotFather Mini App.`,
    );
  }
}

function logTelegramManagerStartupWarning(code: string, message?: string) {
  console.error(
    JSON.stringify({
      event: 'telegram_manager_startup_degraded',
      code,
      message:
        message || `Telegram manager startup readiness degraded: ${code}`,
    }),
  );
}
