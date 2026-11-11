import { AppDataSource } from '../src/database/data-source';
import { TenantChannel } from '../src/channel/entities/tenant-channel.entity';
import {
  decryptProviderCredentialsWithFallback,
  encryptProviderCredentials,
  isProviderCredentialEnvelope,
} from '../src/channel/provider-credentials.util';

type ReencryptOptions = {
  dryRun: boolean;
  primarySecret: string;
  legacySecrets: string[];
};

export async function reencryptProviderCredentials(options: ReencryptOptions) {
  const repository = AppDataSource.getRepository(TenantChannel);
  const channels = await repository.find({
    where: { channelType: 'telegram' },
  });
  const results: Array<{ channelId: string; status: string }> = [];

  for (const channel of channels) {
    if (!isProviderCredentialEnvelope(channel.credentials)) {
      results.push({ channelId: channel.id, status: 'skipped_unencrypted' });
      continue;
    }

    try {
      const decrypted = decryptProviderCredentialsWithFallback(
        channel.credentials,
        [options.primarySecret, ...options.legacySecrets],
      );
      if (decrypted.secret === options.primarySecret) {
        results.push({ channelId: channel.id, status: 'already_current' });
        continue;
      }

      if (!options.dryRun) {
        channel.credentials = encryptProviderCredentials(
          decrypted.credentials,
          options.primarySecret,
        );
        await repository.save(channel);
      }
      results.push({
        channelId: channel.id,
        status: options.dryRun ? 'would_reencrypt' : 'reencrypted',
      });
    } catch (error) {
      results.push({
        channelId: channel.id,
        status: `failed:${error instanceof Error ? error.message : 'unknown_error'}`,
      });
    }
  }

  return results;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const primarySecret =
    process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY ||
    process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY;
  const legacySecrets = [process.env.JWT_SECRET].filter(Boolean) as string[];
  if (!primarySecret)
    throw new Error(
      'PROVIDER_CREDENTIAL_ENCRYPTION_KEY or TELEGRAM_TOKEN_ENCRYPTION_KEY is required',
    );

  await AppDataSource.initialize();
  try {
    const results = await reencryptProviderCredentials({
      dryRun,
      primarySecret,
      legacySecrets,
    });
    for (const result of results) {
      console.log(
        JSON.stringify({
          event: 'telegram_credentials_reencrypt',
          dryRun,
          ...result,
        }),
      );
    }
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) void main();
