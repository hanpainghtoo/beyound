import {
  conversationShoppingFields,
  INTERNAL_SYSTEM_EVENT_TYPE,
  isInternalSystemMessage,
  resolveTelegramBrowseVisitId,
  telegramShoppingIdentityKey,
  withShoppingActivityMetadata,
} from './internal-message.util';

describe('internal shopping activity helpers', () => {
  it('recognizes only the internal system-event shape', () => {
    expect(
      isInternalSystemMessage({
        senderType: 'system',
        messageType: INTERNAL_SYSTEM_EVENT_TYPE,
        isInternal: true,
      }),
    ).toBe(true);
    expect(
      isInternalSystemMessage({
        senderType: 'customer',
        messageType: INTERNAL_SYSTEM_EVENT_TYPE,
        isInternal: true,
      }),
    ).toBe(false);
    expect(
      isInternalSystemMessage({
        senderType: 'system',
        messageType: 'text',
        isInternal: true,
      }),
    ).toBe(false);
  });

  it('maps and merges the shared conversation shopping metadata', () => {
    const metadata = withShoppingActivityMetadata(
      { unrelated: 'kept' },
      {
        shoppingStage: 'browsing',
        shoppingStageUpdatedAt: '2026-10-06T00:00:00.000Z',
        lastShoppingActivityAt: '2026-10-06T00:00:00.000Z',
        needsAttention: false,
      },
    );
    expect(conversationShoppingFields(metadata)).toMatchObject({
      shoppingStage: 'browsing',
      needsAttention: false,
      lastShoppingActivityAt: '2026-10-06T00:00:00.000Z',
    });
    expect((metadata as Record<string, unknown>).unrelated).toBe('kept');
  });

  it('uses the normal provider identity and 30-minute visit boundary', () => {
    expect(telegramShoppingIdentityKey('channel', 'user', 'chat')).toBe(
      'channel:user:chat',
    );
    const now = new Date('2026-10-06T00:30:00.000Z');
    expect(
      resolveTelegramBrowseVisitId(
        'visit-1',
        '2026-10-06T00:00:00.000Z',
        'visit-2',
        now,
      ),
    ).toBe('visit-1');
    expect(
      resolveTelegramBrowseVisitId(
        'visit-1',
        '2026-10-05T23:59:59.999Z',
        'visit-2',
        now,
      ),
    ).toBe('visit-2');
  });
});
