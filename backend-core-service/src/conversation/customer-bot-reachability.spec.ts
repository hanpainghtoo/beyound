/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- This unit test invokes private ingestion helpers with focused in-memory doubles. */
import { ConversationService } from './conversation.service';

describe('ConversationService customer bot reachability', () => {
  function createService() {
    return new ConversationService(
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
    );
  }

  it('clears blocked fields whenever a provider customer is upserted', async () => {
    const service = createService();
    const customer = {
      id: 'customer-1',
      lastContactAt: null,
      fullName: 'Old name',
      profileData: {},
      botBlockedAt: new Date(),
      botBlockedReason: 'bot_blocked',
    };
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      }),
      findOneByOrFail: jest.fn().mockResolvedValue(customer),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    await (service as any).upsertProviderCustomer(
      manager,
      { id: 'channel-1', tenantId: 'tenant-1' },
      { senderId: 'user-1', senderDisplayName: 'New name' },
      'telegram',
      new Date(),
    );

    expect(customer.botBlockedAt).toBeNull();
    expect(customer.botBlockedReason).toBeNull();
  });

  it('recognizes callback events without treating them as messages', () => {
    const service = createService();
    expect(
      (service as any).isCallbackQuery({
        eventType: 'callback_query',
        metadata: {},
      }),
    ).toBe(true);
  });
});
