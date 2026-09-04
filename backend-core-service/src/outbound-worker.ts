import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { CsrService } from './csr/csr.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const csrService = app.get(CsrService);
  const batchSize = boundedNumber(
    process.env.OUTBOUND_WORKER_BATCH_SIZE,
    25,
    1,
    100,
  );
  const intervalMs = boundedNumber(
    process.env.OUTBOUND_WORKER_INTERVAL_MS,
    1000,
    100,
    60_000,
  );
  const once = process.env.OUTBOUND_WORKER_ONCE === 'true';
  let shuttingDown = false;

  const shutdown = async () => {
    shuttingDown = true;
    await app.close();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  do {
    const result =
      await csrService.processPendingOutboundMessageCommands(batchSize);
    if (result.processed > 0) {
      console.log(
        JSON.stringify({ event: 'outbound_commands_processed', ...result }),
      );
    }
    if (once) break;
    await sleep(intervalMs);
  } while (!shuttingDown);

  await app.close();
}

function boundedNumber(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
