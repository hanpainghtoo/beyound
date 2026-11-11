import { ConflictException, NotFoundException } from '@nestjs/common';
import { CustomerTagService } from './customer-tag.service';
import type { CustomerTag } from './entities/customer-tag.entity';

const TENANT = 'tenant-a';

function service(rows: CustomerTag[] = []) {
  const store = [...rows];
  const repository = {
    // Emulates the repository's `order: { name: 'ASC' }` option; unsorted
    // calls (the duplicate scan) return insertion order.
    find: jest.fn(async ({ order }: { order?: { name?: string } } = {}) =>
      order?.name
        ? [...store].sort((a, b) => a.name.localeCompare(b.name))
        : [...store],
    ),
    findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
      store.find((row) => row.id === where.id) || null,
    ),
    create: jest.fn((value: Partial<CustomerTag>) => ({
      id: `t${store.length + 1}`,
      tenantId: TENANT,
      createdAt: new Date(),
      ...value,
    })) as jest.Mock,
    save: jest.fn(async (value: CustomerTag) => {
      const existing = store.find((row) => row.id === value.id);
      if (existing) Object.assign(existing, value);
      else store.push(value as CustomerTag);
      return value;
    }),
    remove: jest.fn(async (value: CustomerTag) => {
      store.splice(store.indexOf(value), 1);
    }),
  };
  return {
    service: new CustomerTagService(repository as any),
    store,
    repository,
  };
}

const row = (id: string, name: string): CustomerTag =>
  ({ id, tenantId: TENANT, name, createdAt: new Date('2026-01-01') }) as CustomerTag;

describe('CustomerTagService', () => {
  it('lists tenant tags sorted by name', async () => {
    const { service: tags } = service([row('t2', 'wholesale'), row('t1', 'vip')]);
    const listed = await tags.list(TENANT);
    expect(listed.map((tag) => tag.name)).toEqual(['vip', 'wholesale']);
  });

  it('creates a trimmed tag', async () => {
    const { service: tags, store } = service();
    const created = await tags.create(TENANT, { name: '  vip  ' });
    expect(created.name).toBe('vip');
    expect(store).toHaveLength(1);
  });

  it('rejects blank names and duplicates within the tenant', async () => {
    const { service: tags } = service([row('t1', 'vip')]);
    await expect(tags.create(TENANT, { name: '   ' })).rejects.toThrow(
      'customer_tag_name_required',
    );
    await expect(tags.create(TENANT, { name: 'VIP' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('renames a tag, rejecting a clash with another tag', async () => {
    const { service: tags } = service([row('t1', 'vip'), row('t2', 'retail')]);
    const renamed = await tags.rename(TENANT, 't1', { name: 'loyal' });
    expect(renamed.name).toBe('loyal');
    await expect(tags.rename(TENANT, 't2', { name: 'LOYAL' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('deletes by id and 404s for unknown or foreign ids', async () => {
    const { service: tags, store } = service([row('t1', 'vip')]);
    await tags.remove(TENANT, 't1');
    expect(store).toHaveLength(0);
    await expect(tags.remove(TENANT, 't1')).rejects.toThrow(NotFoundException);
    await expect(tags.remove('other-tenant', 't2')).rejects.toThrow(
      NotFoundException,
    );
  });
});
