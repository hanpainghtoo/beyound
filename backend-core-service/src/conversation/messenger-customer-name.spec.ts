/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await */
import { ConversationService } from './conversation.service';

/**
 * Provider-resolved customer names.
 *
 * Meta's User Profile API splits a name into first/last and drops the middle
 * name, so a customer was stored as "Ye San" instead of "Ye Htet San". Ingest
 * now prefers the full `name` field; this covers the other half of the fix —
 * correcting rows that were resolved before that, without clobbering a name an
 * agent typed by hand.
 */
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

function createManager(customer: Record<string, any>) {
  const insertBuilder = {
    into: () => insertBuilder,
    values: () => insertBuilder,
    orIgnore: () => insertBuilder,
    execute: jest.fn(async () => ({})),
  };
  const manager = {
    createQueryBuilder: jest.fn(() => ({
      insert: () => insertBuilder,
    })),
    findOneByOrFail: jest.fn(async () => customer),
    save: jest.fn(
      async (_entity: unknown, value: Record<string, any>) => value,
    ),
  };
  return manager;
}

const NOW = new Date('2026-11-05T10:00:00.000Z');
const CHANNEL = { id: 'channel-1', tenantId: 'tenant-1' };

function normalized(displayName: string) {
  return {
    senderId: 'psid-1',
    senderDisplayName: displayName,
    messageType: 'text',
    content: 'hello',
  };
}

async function upsert(
  customer: Record<string, any>,
  displayName: string,
): Promise<Record<string, any>> {
  const manager = createManager(customer);
  await (createService() as any).upsertProviderCustomer(
    manager,
    CHANNEL,
    normalized(displayName),
    'messenger',
    NOW,
  );
  return customer;
}

describe('ConversationService provider customer name', () => {
  it('upgrades a first+last name to the full provider name', async () => {
    const customer = {
      id: 'customer-1',
      fullName: 'Ye San',
      profileData: { provider: 'messenger', externalSenderId: 'psid-1' },
    };

    const saved = await upsert(customer, 'Ye Htet San');

    expect(saved.fullName).toBe('Ye Htet San');
    expect(saved.profileData.providerDisplayName).toBe('Ye Htet San');
  });

  it('adopts the provider name when the customer has none', async () => {
    const customer = { id: 'customer-1', fullName: '', profileData: {} };

    const saved = await upsert(customer, 'Ye Htet San');

    expect(saved.fullName).toBe('Ye Htet San');
  });

  it('never overwrites a name an agent typed', async () => {
    // "Ye San" would otherwise be upgraded by the subset rule; the manual-edit
    // flag is what makes the agent's choice stick.
    const customer = {
      id: 'customer-1',
      fullName: 'Ye San',
      profileData: { nameManuallyEdited: true },
    };

    const saved = await upsert(customer, 'Ye Htet San');

    expect(saved.fullName).toBe('Ye San');
    // The provider's version is still recorded, just not applied.
    expect(saved.profileData.providerDisplayName).toBe('Ye Htet San');
  });

  it('leaves a genuinely different name alone', async () => {
    const customer = {
      id: 'customer-1',
      fullName: 'Ye Htet Aung',
      profileData: { provider: 'messenger' },
    };

    const saved = await upsert(customer, 'Ye Htet San');

    expect(saved.fullName).toBe('Ye Htet Aung');
  });
});
