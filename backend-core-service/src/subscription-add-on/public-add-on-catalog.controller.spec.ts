import { PublicAddOnCatalogController } from './public-add-on-catalog.controller';
import { SubscriptionAddOnService } from './subscription-add-on.service';

describe('PublicAddOnCatalogController', () => {
  it('returns only products already filtered to the active public catalog', async () => {
    const activeProduct = {
      id: 'product-1',
      code: 'message_boost',
      name: 'Message Boost',
      description: 'Extra message capacity',
      price: 50000,
      currency: 'MMK',
      status: 'active',
      version: 1,
      metadata: { internal: 'not-public' },
      components: [],
      createdAt: new Date('2026-09-25T00:00:00.000Z'),
      updatedAt: new Date('2026-09-25T00:00:00.000Z'),
    };
    const addOnService = {
      listActiveProducts: jest.fn().mockResolvedValue([activeProduct]),
    };
    const controller = new PublicAddOnCatalogController(
      addOnService as unknown as SubscriptionAddOnService,
    );

    await expect(controller.listProducts()).resolves.toEqual([
      {
        id: 'product-1',
        name: 'Message Boost',
        description: 'Extra message capacity',
        price: 50000,
        currency: 'MMK',
        components: [],
      },
    ]);
    expect(addOnService.listActiveProducts).toHaveBeenCalledTimes(1);
  });
});
