import { SubscriptionAddOnService } from './subscription-add-on.service';

function createService() {
  const productRows: any[] = [];
  const componentRows: any[] = [];
  const eventRows: any[] = [];

  const componentRepository = {
    create: jest.fn((data: any) => ({
      ...data,
      id: `comp-${componentRows.length + 1}`,
    })),
    save: jest.fn(async (data: any) => {
      const rows = Array.isArray(data) ? data : [data];
      for (const row of rows) {
        if (!row.id) row.id = `comp-${componentRows.length + 1}`;
        componentRows.push(row);
      }
      return data;
    }),
    find: jest.fn(async (opts?: any) => {
      const whereProductId = opts?.where?.productId;
      if (whereProductId) {
        return componentRows
          .filter((row) => row.productId === whereProductId)
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      }
      return componentRows;
    }),
    findOne: jest.fn(async () => null),
    delete: jest.fn(async ({ productId }: any) => {
      for (let i = componentRows.length - 1; i >= 0; i--) {
        if (componentRows[i].productId === productId)
          componentRows.splice(i, 1);
      }
      return { affected: 1 };
    }),
    count: jest.fn(async (opts?: any) => {
      if (opts?.where?.productId) {
        return componentRows.filter(
          (row) => row.productId === opts.where.productId,
        ).length;
      }
      return componentRows.length;
    }),
  };

  const productRepository = {
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (data: any) => {
      const existing = productRows.find((row) => row.id === data.id);
      if (existing) {
        Object.assign(existing, data);
        return existing;
      }
      const row = { id: `product-${productRows.length + 1}`, ...data };
      productRows.push(row);
      return row;
    }),
    find: jest.fn(async () => productRows),
    findOne: jest.fn(async (opts?: any) => {
      if (opts?.where?.code !== undefined) {
        return productRows.find((row) => row.code === opts.where.code) || null;
      }
      if (opts?.where?.id !== undefined) {
        return productRows.find((row) => row.id === opts.where.id) || null;
      }
      return productRows[0] || null;
    }),
    delete: jest.fn(async ({ id }: any) => {
      for (let i = productRows.length - 1; i >= 0; i--) {
        if (productRows[i].id === id) productRows.splice(i, 1);
      }
      return { affected: 1 };
    }),
  };

  const eventRepository = {
    create: jest.fn((data: any) => ({
      ...data,
      id: `event-${eventRows.length + 1}`,
    })),
    save: jest.fn(async (data: any) => {
      const rows = Array.isArray(data) ? data : [data];
      for (const row of rows) {
        if (!row.id) row.id = `event-${eventRows.length + 1}`;
        eventRows.push(row);
      }
      return data;
    }),
    findOne: jest.fn(async (opts?: any) => {
      if (opts?.where?.idempotencyKey !== undefined) {
        return (
          eventRows.find(
            (row) => row.idempotencyKey === opts.where.idempotencyKey,
          ) || null
        );
      }
      return eventRows[0] || null;
    }),
    find: jest.fn(async (opts?: any) => {
      if (opts?.where?.productId !== undefined) {
        return eventRows.filter(
          (row) => row.productId === opts.where.productId,
        );
      }
      return eventRows;
    }),
  };

  const manager = {
    create: jest.fn((entity: any, data: any) => ({
      ...data,
      __entityName: entity && entity.name,
    })),
    save: jest.fn(async (entityOrData: any, maybeData?: any) => {
      // TypeORM's manager.save supports both `save(Entity, data)` and the
      // single-argument `save(createdEntity)` form. Resolve the target entity
      // name from either the class reference or the stamp on created objects.
      const entityName =
        typeof entityOrData === 'function'
          ? entityOrData.name
          : entityOrData?.__entityName;
      const data = maybeData ?? entityOrData;
      if (entityName === 'SubscriptionAddOnProduct') {
        return productRepository.save(data);
      }
      if (entityName === 'SubscriptionAddOnProductComponent') {
        return componentRepository.save(data);
      }
      if (entityName === 'SubscriptionAddOnEvent') {
        return eventRepository.save(data);
      }
      return data;
    }),
    find: jest.fn(async (entity: any, opts?: any) =>
      componentRepository.find(opts),
    ),
    delete: jest.fn(async (entity: any, opts: any) => {
      if (entity && entity.name === 'SubscriptionAddOnProduct') {
        return productRepository.delete(opts);
      }
      return componentRepository.delete(opts);
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: any) => callback(manager)),
  };

  const service = new SubscriptionAddOnService(
    productRepository as any,
    componentRepository as any,
    eventRepository as any,
    dataSource as any,
  );

  return {
    service,
    productRepository,
    componentRepository,
    eventRepository,
    manager,
    productRows,
    componentRows,
    eventRows,
  };
}

const messageBoost = {
  code: 'message_boost_10000_2000',
  name: 'Message Boost',
  description: 'Extra monthly messages',
  price: 50000,
  currency: 'MMK',
  components: [
    { componentType: 'inbound_messages', quantity: 10000 },
    { componentType: 'outbound_messages', quantity: 2000 },
  ],
};

describe('SubscriptionAddOnService', () => {
  it('creates a product with version 1 and every component visible', async () => {
    const { service, productRows, componentRows, eventRows } = createService();

    const created = await service.createProduct(messageBoost);

    expect(created.id).toBe('product-1');
    expect(created.code).toBe('message_boost_10000_2000');
    expect(created.price).toBe(50000);
    expect(created.version).toBe(1);
    expect(created.status).toBe('inactive');
    expect(created.components).toHaveLength(2);
    expect(created.components[0].componentType).toBe('inbound_messages');
    expect(created.components[0].quantity).toBe(10000);
    expect(created.components[0].unit).toBe('messages');
    expect(productRows).toHaveLength(1);
    expect(componentRows).toHaveLength(2);
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0].eventType).toBe('add_on_product_created');
  });

  it('refuses a duplicate product code', async () => {
    const { service } = createService();
    await service.createProduct(messageBoost);
    await expect(service.createProduct(messageBoost)).rejects.toThrow(
      /already exists/,
    );
  });

  it('bumps the version and snapshots before/after on update', async () => {
    const { service } = createService();
    const created = await service.createProduct(messageBoost);

    const updated = await service.updateProduct(created.id, {
      price: 55000,
      components: [
        { componentType: 'inbound_messages', quantity: 12000 },
        { componentType: 'outbound_messages', quantity: 3000 },
      ],
    });

    expect(updated.version).toBe(2);
    expect(updated.price).toBe(55000);
    // The edit replaced the component set; nothing from the old set leaks.
    expect(updated.components).toHaveLength(2);
    expect(updated.components[0].quantity).toBe(12000);
  });

  it('does not mutate prior data when editing (snapshot immutability)', async () => {
    const { service, eventRows } = createService();
    const created = await service.createProduct(messageBoost);
    await service.updateProduct(created.id, { price: 60000 });

    // The update event carries the before snapshot at the exact prior version.
    const updateEvent = eventRows.find(
      (row) => row.eventType === 'add_on_product_updated',
    );
    expect(updateEvent.metadata.before.price).toBe(50000);
    expect(updateEvent.metadata.before.version).toBe(1);
    expect(updateEvent.metadata.after.version).toBe(2);
  });

  it('publishes only products with at least one valid component', async () => {
    const { service } = createService();
    const created = await service.createProduct(messageBoost);
    const published = await service.publishProduct(created.id);
    expect(published.status).toBe('active');
    expect(published.version).toBe(2);
  });

  it('archives a product but refuses hard delete of archived products', async () => {
    const { service } = createService();
    const created = await service.createProduct(messageBoost);
    await service.publishProduct(created.id);

    const archived = await service.archiveProduct(created.id);
    expect(archived.status).toBe('archived');

    await expect(service.deleteProduct(created.id)).rejects.toThrow(
      /Only never-published top-up products can be deleted/,
    );
  });

  it('allows hard delete only for never-published products', async () => {
    const { service, productRows, eventRows } = createService();
    const created = await service.createProduct(messageBoost);
    await service.deleteProduct(created.id);
    expect(productRows).toHaveLength(0);
    expect(eventRows[1].eventType).toBe('add_on_product_deleted');
    // The delete event survives with a null product_id instead of being
    // cascade-removed with the product row.
    expect(eventRows[1].productId).toBeNull();
    expect(eventRows[1].metadata.deletedProductId).toBe(created.id);
  });

  it('blocks hard delete once a product has mutation history', async () => {
    const { service } = createService();
    const created = await service.createProduct(messageBoost);
    // A metadata-only edit keeps the product inactive but gives it history.
    await service.updateProduct(created.id, { description: 'updated' });
    await expect(service.deleteProduct(created.id)).rejects.toThrow(
      /mutation history cannot be hard-deleted/,
    );
  });

  it('refuses editing archived products', async () => {
    const { service } = createService();
    const created = await service.createProduct(messageBoost);
    await service.archiveProduct(created.id);
    await expect(
      service.updateProduct(created.id, { price: 1 }),
    ).rejects.toThrow(/cannot be edited/);
  });

  it('replays idempotent create mutations instead of duplicating', async () => {
    const { service, productRows } = createService();
    const first = await service.createProduct(messageBoost, {
      idempotencyKey: 'create-1',
    });
    const second = await service.createProduct(messageBoost, {
      idempotencyKey: 'create-1',
    });

    expect(second.id).toBe(first.id);
    expect(productRows).toHaveLength(1);
  });

  it('replays idempotent publish mutations', async () => {
    const { service, eventRows } = createService();
    const created = await service.createProduct(messageBoost);
    const pub1 = await service.publishProduct(created.id, {
      idempotencyKey: 'pub-1',
    });
    const pub2 = await service.publishProduct(created.id, {
      idempotencyKey: 'pub-1',
    });
    expect(pub2.version).toBe(pub1.version);
    expect(
      eventRows.filter((row) => row.eventType === 'add_on_product_published'),
    ).toHaveLength(1);
  });
});
