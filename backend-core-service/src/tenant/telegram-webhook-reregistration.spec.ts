import { encryptProviderCredentials } from '../channel/provider-credentials.util';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { reregisterTelegramWebhooks } from '../../scripts/reregister-telegram-webhooks';

describe('reregisterTelegramWebhooks', () => {
  it('supports dry-run and never logs credentials', async () => {
    const channel = {
      id: 'channel-1',
      webhookUrl: 'https://hooks.example/telegram/channel-1',
      credentials: encryptProviderCredentials(
        { botToken: '123456:secret-token', secretToken: 'webhook-secret' },
        'current-key',
      ),
    } as unknown as TenantChannel;
    const setWebhook = jest.fn();
    const logs: Record<string, unknown>[] = [];
    await expect(
      reregisterTelegramWebhooks({
        dryRun: true,
        delayMs: 0,
        primarySecret: 'current-key',
        legacySecrets: [],
        client: { setWebhook },
        channels: [channel],
        onResult: (result) => logs.push(result),
      }),
    ).resolves.toMatchObject([{ status: 'would_register' }]);
    expect(setWebhook).not.toHaveBeenCalled();
    expect(JSON.stringify(logs)).not.toContain('secret-token');
    expect(JSON.stringify(logs)).not.toContain('webhook-secret');
  });

  it('preserves the existing secret and registers callback queries idempotently', async () => {
    const channel = {
      id: 'channel-1',
      webhookUrl: 'https://hooks.example/telegram/channel-1',
      credentials: encryptProviderCredentials(
        { botToken: '123456:secret-token', secretToken: 'webhook-secret' },
        'current-key',
      ),
    } as unknown as TenantChannel;
    const setWebhook = jest.fn().mockResolvedValue({ ok: true });
    await reregisterTelegramWebhooks({
      dryRun: false,
      delayMs: 0,
      primarySecret: 'current-key',
      legacySecrets: [],
      client: { setWebhook },
      channels: [channel, channel],
    });
    expect(setWebhook).toHaveBeenCalledTimes(2);
    expect(setWebhook).toHaveBeenCalledWith(
      '123456:secret-token',
      expect.objectContaining({
        secretToken: 'webhook-secret',
        allowedUpdates: ['message', 'callback_query'],
        dropPendingUpdates: false,
      }),
    );
  });
});
