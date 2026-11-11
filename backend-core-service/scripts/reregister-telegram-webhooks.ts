import { AppDataSource } from '../src/database/data-source';
import { TenantChannel } from '../src/channel/entities/tenant-channel.entity';
import {
  decryptProviderCredentialsWithFallback,
  isProviderCredentialEnvelope,
} from '../src/channel/provider-credentials.util';
import { TelegramBotApiClient } from '../src/channel/telegram-bot-api.client';
import { In } from 'typeorm';

type ReregisterOptions = {
  dryRun: boolean;
  delayMs: number;
  primarySecret: string;
  legacySecrets: string[];
  client: Pick<TelegramBotApiClient, 'setWebhook'>;
  channels: TenantChannel[];
  onResult?: (result: Record<string, unknown>) => void;
};

export async function reregisterTelegramWebhooks(options: ReregisterOptions) {
  const results: Array<Record<string, unknown>> = [];
  for (const channel of options.channels) {
    const base = {
      channelId: channel.id,
      webhookUrl: channel.webhookUrl,
      dryRun: options.dryRun,
    };
    try {
      if (!channel.webhookUrl) throw new Error('webhook_url_missing');
      if (!isProviderCredentialEnvelope(channel.credentials))
        throw new Error('credentials_not_encrypted');
      const decrypted = decryptProviderCredentialsWithFallback(
        channel.credentials,
        [options.primarySecret, ...options.legacySecrets],
      );
      const botToken =
        typeof decrypted.credentials.botToken === 'string'
          ? decrypted.credentials.botToken
          : undefined;
      const secretToken =
        typeof decrypted.credentials.secretToken === 'string'
          ? decrypted.credentials.secretToken
          : undefined;
      if (!botToken) throw new Error('bot_token_missing');
      if (!secretToken) throw new Error('secret_token_missing');

      if (!options.dryRun) {
        await options.client.setWebhook(botToken, {
          url: channel.webhookUrl,
          secretToken,
          allowedUpdates: ['message', 'callback_query'],
          dropPendingUpdates: false,
        });
      }
      const result = {
        ...base,
        status: options.dryRun ? 'would_register' : 'registered',
      };
      results.push(result);
      options.onResult?.(result);
    } catch (error) {
      const result = {
        ...base,
        status: 'failed',
        error: error instanceof Error ? error.message : 'unknown_error',
      };
      results.push(result);
      options.onResult?.(result);
    }
    if (options.delayMs > 0)
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
  }
  return results;
}

function readArgs(argv: string[]) {
  const channelIds: string[] = [];
  let limit: number | undefined;
  for (const arg of argv) {
    if (arg.startsWith('--channel=')) {
      const id = arg.slice('--channel='.length).trim();
      if (id) channelIds.push(id);
    } else if (arg.startsWith('--limit=')) {
      const n = Number(arg.slice('--limit='.length));
      if (!Number.isInteger(n) || n <= 0)
        throw new Error('--limit must be a positive integer');
      limit = n;
    }
  }
  return {
    dryRun: argv.includes('--dry-run'),
    all: argv.includes('--all'),
    channelIds,
    limit,
  };
}

async function main() {
  const { dryRun, all, channelIds, limit } = readArgs(process.argv.slice(2));
  const primarySecret =
    process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY ||
    process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY;
  const legacySecrets = [process.env.JWT_SECRET].filter(Boolean) as string[];
  if (!primarySecret)
    throw new Error(
      'PROVIDER_CREDENTIAL_ENCRYPTION_KEY or TELEGRAM_TOKEN_ENCRYPTION_KEY is required',
    );

  // Safety guard: a real run must be scoped, or explicitly opted into with --all.
  if (!dryRun && channelIds.length === 0 && limit === undefined && !all) {
    throw new Error(
      'Refusing to re-register every Telegram channel. Pass --channel=<id>, --limit=<n>, or --all (or use --dry-run).',
    );
  }

  await AppDataSource.initialize();
  try {
    const channels = await AppDataSource.getRepository(TenantChannel).find({
      where: {
        channelType: 'telegram',
        ...(channelIds.length > 0 ? { id: In(channelIds) } : {}),
      },
      order: { id: 'ASC' },
      ...(limit !== undefined ? { take: limit } : {}),
    });

    if (channelIds.length > 0 && channels.length !== channelIds.length) {
      const found = new Set(channels.map((c) => c.id));
      const missing = channelIds.filter((id) => !found.has(id));
      console.log(
        JSON.stringify({
          event: 'telegram_webhook_reregister_missing_channels',
          missing,
        }),
      );
    }

    const results = await reregisterTelegramWebhooks({
      dryRun,
      delayMs: Number(process.env.TELEGRAM_WEBHOOK_REREGISTER_DELAY_MS || 250),
      primarySecret,
      legacySecrets,
      client: new TelegramBotApiClient(),
      channels,
      onResult: (result) =>
        console.log(
          JSON.stringify({ event: 'telegram_webhook_reregister', ...result }),
        ),
    });

    const failed = results.filter((r) => r.status === 'failed').length;
    console.log(
      JSON.stringify({
        event: 'telegram_webhook_reregister_summary',
        dryRun,
        total: results.length,
        succeeded: results.length - failed,
        failed,
        allowedUpdates: ['message', 'callback_query'],
      }),
    );
    if (failed > 0) process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) void main();
