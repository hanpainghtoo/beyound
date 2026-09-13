import { HttpException } from '@nestjs/common';

import { ConversationService } from './conversation.service';

function createService(channel: Record<string, any>) {
  const channelRepository = {
    findOne: jest.fn().mockResolvedValue(channel),
  };
  const service = new ConversationService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    channelRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, channelRepository };
}

describe('ConversationService ingest disconnect guard', () => {
  it('rejects inbound for a disconnected channel without writing', async () => {
    const { service, channelRepository } = createService({
      id: 'channel-1',
      tenantId: 'tenant-1',
      channelType: 'telegram',
      status: 'inactive',
      connectionStatus: 'disabled',
    });

    const error = await service
      .ingestProviderMessage({
        provider: 'telegram',
        channelId: 'channel-1',
        normalized: {},
      } as any)
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(409);
    expect((error as HttpException).getResponse()).toMatchObject({
      code: 'CHANNEL_DISABLED',
    });
    expect(channelRepository.findOne).toHaveBeenCalledTimes(1);
  });
});
