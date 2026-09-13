import { ConflictException } from '@nestjs/common';

import { ChannelAdapterService } from '../channel-adapter/channel-adapter.service';
import { TenantService } from './tenant.service';

const CHANNEL_ID = '12345678-1234-4234-8234-123456789abc';

function createTenantService(channel: Record<string, any>) {
  const tenantChannel = {
    findOne: jest.fn().mockResolvedValue(channel),
    save: jest.fn((value: Record<string, any>) =>
      Promise.resolve({ ...value }),
    ),
  };
  const auditLogService = {
    logTenantUserAction: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TenantService(
    {} as any,
    tenantChannel as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    auditLogService as any,
    {} as any,
  );
  return { service, tenantChannel, auditLogService };
}

function disconnectedChannel() {
  return {
    id: CHANNEL_ID,
    tenantId: 'tenant-1',
    channelType: 'telegram',
    channelName: 'hellobot',
    status: 'inactive',
    connectionStatus: 'disabled',
    webhookRegistrationStatus: 'pending',
    credentials: {},
    tenant: { id: 'tenant-1', status: 'active' },
  };
}

async function responseCode(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ConflictException) {
      const response: unknown = error.getResponse();
      if (typeof response === 'object' && response !== null) {
        const code: unknown = (response as { code?: unknown }).code;
        return typeof code === 'string' ? code : null;
      }
      return null;
    }
    throw error;
  }
}

describe('TenantService disconnect gating', () => {
  it('resolves a disconnected channel as acknowledge_without_ingestion', async () => {
    const { service } = createTenantService(disconnectedChannel());
    const result = await service.resolveInternalWebhookChannel(
      CHANNEL_ID,
      'telegram',
    );
    expect(result.disposition).toBe('acknowledge_without_ingestion');
    expect(result.reasonCode).toBe('CHANNEL_DISABLED');
  });

  it('rejects verification reads for a disconnected channel', async () => {
    const { service } = createTenantService(disconnectedChannel());
    await expect(
      service.getInternalProviderVerification(CHANNEL_ID, 'telegram'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await responseCode(
        service.getInternalProviderVerification(CHANNEL_ID, 'telegram'),
      ),
    ).toBe('CHANNEL_DISABLED');
  });

  it('rejects credential reads for a disconnected channel', async () => {
    const { service } = createTenantService(disconnectedChannel());
    expect(
      await responseCode(
        service.getInternalProviderCredentials(CHANNEL_ID, 'telegram'),
      ),
    ).toBe('CHANNEL_DISABLED');
  });

  it('disconnect marks inactive+disabled while keeping credentials', async () => {
    const stored = {
      id: CHANNEL_ID,
      tenantId: 'tenant-1',
      channelType: 'telegram',
      channelName: 'hellobot',
      status: 'active',
      connectionStatus: 'connected',
      credentialStatus: 'encrypted',
      webhookRegistrationStatus: 'registered',
      credentials: { encrypted: 'x' },
    };
    const { service, tenantChannel, auditLogService } =
      createTenantService(stored);
    jest
      .spyOn(service as any, 'cleanupProviderWebhookOnRemove')
      .mockResolvedValue(null);
    process.env.WEBHOOK_PUBLIC_BASE_URL = 'https://example.test';

    await service.disconnectChannel('tenant-1', CHANNEL_ID, 'user-1');

    const saved = tenantChannel.save.mock.calls[0][0];
    expect(saved.status).toBe('inactive');
    expect(saved.connectionStatus).toBe('disabled');
    expect(saved.credentials).toEqual({ encrypted: 'x' });
    expect(auditLogService.logTenantUserAction).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      expect.objectContaining({ action: 'channel_disconnected' }),
      undefined,
    );
  });

  it('drops Telegram pending updates on provider cleanup', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const { service } = createTenantService({
      id: CHANNEL_ID,
      tenantId: 'tenant-1',
      channelType: 'telegram',
      status: 'active',
      connectionStatus: 'connected',
      credentials: { botToken: 'tok' },
    });
    const callWebhook = jest
      .spyOn(service as any, 'callIntegrationTelegramWebhook')
      .mockResolvedValue({ ok: true });
    interface CleanupProbe {
      cleanupProviderWebhookOnRemove(channel: {
        id: string;
        channelType: string;
        credentials: unknown;
      }): Promise<string | null>;
    }
    const probe = service as unknown as CleanupProbe;

    const errorCode = await probe.cleanupProviderWebhookOnRemove({
      id: CHANNEL_ID,
      channelType: 'telegram',
      credentials: { botToken: 'tok' },
    });

    expect(errorCode).toBeNull();
    expect(callWebhook).toHaveBeenCalledWith(
      'delete',
      expect.objectContaining({ dropPendingUpdates: true }),
    );
  });
});

describe('ChannelAdapterService disconnect gating', () => {
  it('rejects sends for a disconnected channel without touching the provider', async () => {
    const channelRepository = {
      findOne: jest.fn().mockResolvedValue(disconnectedChannel()),
    };
    const service = new ChannelAdapterService(channelRepository as any);
    const sendSpy = jest.spyOn(service.getAdapter('telegram'), 'sendMessage');

    await expect(
      service.sendMessage('telegram', {
        channelId: CHANNEL_ID,
        conversationId: 'conv-1',
        recipientId: 'chat-1',
        content: 'hello',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
