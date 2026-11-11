import { BadRequestException } from '@nestjs/common';
import type { EntityManager, Repository } from 'typeorm';

import { FeatureToggleService } from './feature-toggle.service';
import { FeatureCategory } from './entities/feature-category.entity';
import { TenantFeatureConfig } from './entities/tenant-feature-config.entity';

type CategorySeed = {
  key: string;
  dependsOn?: string | null;
  isLockable?: boolean;
  displayOrder?: number;
};

const CATEGORY_SEEDS: CategorySeed[] = [
  { key: 'inbox', isLockable: false, displayOrder: 10 },
  { key: 'orders', displayOrder: 20 },
  { key: 'deliveries', dependsOn: 'orders', displayOrder: 30 },
  { key: 'products', displayOrder: 40 },
];

function makeCategories(): FeatureCategory[] {
  return CATEGORY_SEEDS.map((seed, index) => ({
    id: `cat-${seed.key}`,
    key: seed.key,
    displayName: seed.key[0].toUpperCase() + seed.key.slice(1),
    description: null,
    dependsOn: seed.dependsOn ?? null,
    isLockable: seed.isLockable ?? true,
    displayOrder: seed.displayOrder ?? index,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

/**
 * Minimal in-memory stand-in for the two repositories plus the transaction
 * manager, so the cascade rules can be asserted without a live database.
 */
function createHarness(initialEnabled: Record<string, boolean> = {}) {
  const categories = makeCategories();
  const configs = categories
    .filter((c) => initialEnabled[c.key] !== undefined)
    .map((c) => ({
      id: `cfg-${c.id}`,
      tenantId: 'tenant-1',
      featureCategoryId: c.id,
      isEnabled: initialEnabled[c.key],
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

  const match = (row: TenantFeatureConfig, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'featureCategoryId') {
        const list = Array.isArray(value) ? value : [value];
        return list.includes(row.featureCategoryId);
      }
      return (row as unknown as Record<string, unknown>)[key] === value;
    });

  const applyOrder = <T extends { displayOrder?: number }>(rows: T[]) =>
    [...rows].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  const manager = {
    find: jest.fn(async (entity: unknown, options?: any) => {
      if (entity === FeatureCategory) {
        const where = options?.where;
        const rows = where
          ? categories.filter((c) => matchCategory(c, where))
          : categories;
        return applyOrder(rows as any);
      }
      if (entity === TenantFeatureConfig) {
        const where = options?.where;
        const rows = where
          ? configs.filter((row) => match(row, where))
          : configs;
        return rows.map((row) => ({ ...row }));
      }
      return [];
    }),
    findOne: jest.fn(async (entity: unknown, options?: any) => {
      const where = options?.where ?? options;
      if (entity === FeatureCategory) {
        return categories.find((c) => matchCategory(c, where)) ?? null;
      }
      const row = configs.find((r) => match(r, where));
      return row ? { ...row } : null;
    }),
    create: jest.fn((entity: unknown, data: any) => ({ ...data })),
    save: jest.fn(async (...args: any[]) => {
      const data = args.length > 1 ? args[1] : args[0];
      const rows = Array.isArray(data) ? data : [data];
      for (const row of rows) {
        if (row.id) {
          const idx = configs.findIndex((c) => c.id === row.id);
          if (idx >= 0) configs[idx] = { ...configs[idx], ...row };
        } else {
          configs.push({ ...row, id: `cfg-new-${configs.length}` });
        }
      }
      return rows;
    }),
    getRepository: jest.fn((entity: unknown) => ({
      find: async () => (entity === FeatureCategory ? categories : configs),
      findOne: async (options: any) =>
        configs.find((r) => match(r, options.where)) ?? null,
      createQueryBuilder: () => ({
        insert: () => ({
          into: () => ({
            values: () => ({ orIgnore: () => ({ execute: async () => ({}) }) }),
          }),
        }),
      }),
      create: (data: any) => ({ ...data }),
      save: async (row: any) => {
        configs.push(row);
        return row;
      },
    })),
  };

  const categoryRepository = { find: async () => categories };
  const configRepository = {
    findOne: async () => null,
    createQueryBuilder: () => ({
      insert: () => ({
        into: () => ({
          values: () => ({
            orIgnore: () => ({ execute: async () => ({}) }),
          }),
        }),
      }),
    }),
  };

  const service = new FeatureToggleService(
    categoryRepository as unknown as Repository<FeatureCategory>,
    configRepository as unknown as Repository<TenantFeatureConfig>,
    {
      manager: manager as unknown as EntityManager,
      transaction: async (cb: (m: EntityManager) => unknown) =>
        cb(manager as unknown as EntityManager),
    } as any,
  );

  const enabledOf = (key: string) => {
    const category = categories.find((c) => c.key === key)!;
    const row = configs.find((r) => r.featureCategoryId === category.id);
    return row?.isEnabled ?? true;
  };

  return { service, categories, enabledOf };
}

function matchCategory(
  category: FeatureCategory,
  where: Record<string, unknown>,
) {
  return Object.entries(where).every(
    ([key, value]) =>
      (category as unknown as Record<string, unknown>)[key] === value,
  );
}

describe('FeatureToggleService (Plan 55)', () => {
  describe('getForTenant', () => {
    it('treats a missing config row as enabled', async () => {
      const { service } = createHarness();
      const views = await service.getForTenant('tenant-1');

      expect(views.find((v) => v.key === 'orders')?.isEnabled).toBe(true);
      expect(views.find((v) => v.key === 'inbox')?.isEnabled).toBe(true);
    });

    it('marks the inbox category as locked', async () => {
      const { service } = createHarness();
      const views = await service.getForTenant('tenant-1');

      expect(views.find((v) => v.key === 'inbox')?.isLockable).toBe(false);
      expect(views.find((v) => v.key === 'orders')?.isLockable).toBe(true);
    });

    it('sets canDisable=false when a dependency is off', async () => {
      const { service } = createHarness({ orders: false, deliveries: false });
      const views = await service.getForTenant('tenant-1');

      expect(views.find((v) => v.key === 'deliveries')?.canDisable).toBe(false);
      expect(views.find((v) => v.key === 'orders')?.canDisable).toBe(true);
    });

    it('sets canDisable=true when the dependency is on', async () => {
      const { service } = createHarness({ orders: true, deliveries: true });
      const views = await service.getForTenant('tenant-1');

      expect(views.find((v) => v.key === 'deliveries')?.canDisable).toBe(true);
    });
  });

  describe('setEnabled', () => {
    it('cascades disabling orders to deliveries', async () => {
      const { service, enabledOf } = createHarness();
      await service.setEnabled('tenant-1', 'orders', false, 'user-1');

      expect(enabledOf('orders')).toBe(false);
      expect(enabledOf('deliveries')).toBe(false);
      expect(enabledOf('inbox')).toBe(true);
    });

    it('does NOT restore deliveries when orders is re-enabled', async () => {
      const { service, enabledOf } = createHarness();
      await service.setEnabled('tenant-1', 'orders', false);
      await service.setEnabled('tenant-1', 'orders', true);

      expect(enabledOf('orders')).toBe(true);
      expect(enabledOf('deliveries')).toBe(false);
    });

    it('rejects disabling a locked category', async () => {
      const { service, enabledOf } = createHarness();
      await expect(
        service.setEnabled('tenant-1', 'inbox', false),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(enabledOf('inbox')).toBe(true);
    });

    it('rejects an unknown feature key', async () => {
      const { service } = createHarness();
      await expect(
        service.setEnabled('tenant-1', 'nope', false),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects enabling deliveries while orders is off', async () => {
      const { service, enabledOf } = createHarness({
        orders: false,
        deliveries: false,
      });
      await expect(
        service.setEnabled('tenant-1', 'deliveries', true),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(enabledOf('deliveries')).toBe(false);
    });

    it('allows disabling deliveries on its own', async () => {
      const { service, enabledOf } = createHarness();
      await service.setEnabled('tenant-1', 'deliveries', false);

      expect(enabledOf('deliveries')).toBe(false);
      expect(enabledOf('orders')).toBe(true);
    });
  });

  describe('seedDefaultsForTenant', () => {
    it('inserts one enabled row per catalog category', async () => {
      const { service, enabledOf } = createHarness();
      await service.seedDefaultsForTenant('tenant-1');

      expect(enabledOf('inbox')).toBe(true);
      expect(enabledOf('orders')).toBe(true);
      expect(enabledOf('deliveries')).toBe(true);
    });
  });
});
