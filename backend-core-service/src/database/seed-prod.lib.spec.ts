import { ensureProductionBootstrap } from './seed-prod.lib';
import { productionSubscriptionPlans } from './production-bootstrap.data';

function createRepository<T extends Record<string, unknown>>(
  existing: T[] = [],
) {
  const records = [...existing];

  return {
    findOne: jest.fn(async ({ where }: { where: Partial<T> }) => {
      const [key, value] = Object.entries(where)[0];
      return records.find((record) => record[key as keyof T] === value) || null;
    }),
    create: jest.fn((value: T) => value),
    save: jest.fn(async (value: T) => {
      const existingIndex = records.findIndex(
        (record) =>
          record === value ||
          ('email' in value &&
            'email' in record &&
            record.email === value.email) ||
          ('name' in value && 'name' in record && record.name === value.name),
      );
      if (existingIndex >= 0) {
        records[existingIndex] = value;
      } else {
        records.push(value);
      }
      return value;
    }),
    records,
  };
}

describe('ensureProductionBootstrap', () => {
  it('does not create demo tenants or .local users in production bootstrap data', async () => {
    const serialized = JSON.stringify(productionSubscriptionPlans);
    expect(serialized.includes('KME-DEMO')).toBe(false);
    expect(serialized.includes('.local')).toBe(false);
  });

  it('is idempotent and does not reset an existing platform admin password hash', async () => {
    const existingAdmin = {
      email: 'admin@zayos.com.mm',
      fullName: 'Existing Admin',
      passwordHash: 'existing-password-hash',
      role: 'super_admin',
      status: 'active',
      twoFactorEnabled: false,
    };
    const platformAdminRepository = createRepository([existingAdmin]);
    const subscriptionPlanRepository = createRepository(
      productionSubscriptionPlans.map((plan) => ({ ...plan })),
    );

    const result = await ensureProductionBootstrap({
      adminConfig: {
        fullName: 'Launch Admin',
        email: 'admin@zayos.com.mm',
      },
      passwordHash: 'new-password-hash',
      platformAdminRepository: platformAdminRepository as never,
      subscriptionPlanRepository: subscriptionPlanRepository as never,
      subscriptionPlans: productionSubscriptionPlans,
    });

    expect(result.platformAdminCreated).toBe(false);
    expect(platformAdminRepository.records).toHaveLength(1);
    expect(platformAdminRepository.records[0]).toMatchObject({
      email: 'admin@zayos.com.mm',
      fullName: 'Launch Admin',
      passwordHash: 'existing-password-hash',
    });
  });
});
