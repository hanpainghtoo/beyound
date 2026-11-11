import { BadRequestException } from '@nestjs/common';

import { EntitlementService } from './entitlement.service';
import { TenantEntitlement } from './entities/tenant-entitlement.entity';
import { TenantEntitlementEvent } from './entities/tenant-entitlement-event.entity';

function createManager(
  overrides: {
    entitlementRepo?: Record<string, jest.Mock>;
    eventRepo?: Record<string, jest.Mock>;
    planRepo?: Record<string, jest.Mock>;
  } = {},
) {
  const entitlementRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({
      id: value.id || 'entitlement-1',
      ...value,
    })),
    ...overrides.entitlementRepo,
  };
  const eventRepo = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 'event-1', ...value })),
    ...overrides.eventRepo,
  };
  const planRepo = {
    findOne: jest.fn(async () => ({
      id: 'plan-1',
      status: 'active',
      features: { trialDays: 14 },
    })),
    ...overrides.planRepo,
  };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity === TenantEntitlement) return entitlementRepo;
      if (entity === TenantEntitlementEvent) return eventRepo;
      return planRepo;
    }),
  };
  return { manager, entitlementRepo, eventRepo, planRepo };
}

function createService(
  manager = createManager().manager,
  repoOverrides: Record<string, jest.Mock> = {},
) {
  const entitlementRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    ...repoOverrides,
  };
  const eventRepository = {};
  const planRepository = {};
  const dataSource = {
    manager,
    transaction: jest.fn(async (callback) => callback(manager)),
  };
  const service = new EntitlementService(
    entitlementRepository as any,
    eventRepository as any,
    planRepository as any,
    dataSource as any,
  );
  return { service, dataSource, entitlementRepository };
}

describe('EntitlementService', () => {
  it('creates exactly one server-approved trial entitlement', async () => {
    const { manager, entitlementRepo, eventRepo } = createManager();
    entitlementRepo.findOne.mockResolvedValue(null);
    const { service } = createService(manager);
    const trialStartsAt = new Date('2026-07-18T00:00:00.000Z');

    await expect(
      service.createInitialTrial({
        tenantId: 'tenant-1',
        planId: 'plan-1',
        trialStartsAt,
        trialDays: 14,
        actor: { type: 'tenant_user', id: 'owner@example.test' },
        manager: manager as any,
      }),
    ).resolves.toMatchObject({
      tenantId: 'tenant-1',
      planId: 'plan-1',
      state: 'trial_active',
      trialStartsAt,
      trialEndsAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(entitlementRepo.save).toHaveBeenCalledTimes(1);
    expect(eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        previousState: null,
        newState: 'trial_active',
        source: 'registration',
        idempotencyKey: 'registration:tenant-1',
      }),
    );
  });

  it('returns an existing trial entitlement instead of creating a duplicate', async () => {
    const existing = {
      id: 'entitlement-existing',
      tenantId: 'tenant-1',
      state: 'trial_active',
    };
    const { manager, entitlementRepo, eventRepo } = createManager();
    entitlementRepo.findOne.mockResolvedValue(existing);
    const { service } = createService(manager);

    await expect(
      service.createInitialTrial({
        tenantId: 'tenant-1',
        planId: 'plan-1',
        trialStartsAt: new Date('2026-07-18T00:00:00.000Z'),
        trialDays: 14,
        actor: { type: 'tenant_user', id: 'owner@example.test' },
        manager: manager as any,
      }),
    ).resolves.toBe(existing);

    expect(entitlementRepo.save).not.toHaveBeenCalled();
    expect(eventRepo.save).not.toHaveBeenCalled();
  });

  it('rejects invalid transitions', async () => {
    const { manager, entitlementRepo } = createManager();
    entitlementRepo.findOne.mockResolvedValue({
      id: 'entitlement-1',
      tenantId: 'tenant-1',
      state: 'trial_active',
    });
    const { service } = createService(manager);

    await expect(
      service.transition({
        tenantId: 'tenant-1',
        toState: 'expired',
        actor: { type: 'system' },
        source: 'system',
        reason: 'Skip grace',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('moves trial and grace entitlements at their exact due boundaries', async () => {
    const dueAt = new Date('2026-08-01T00:00:00.000Z');
    const trial = {
      id: 'trial',
      tenantId: 'tenant-1',
      state: 'trial_active',
      trialEndsAt: dueAt,
    };
    const grace = {
      id: 'grace',
      tenantId: 'tenant-2',
      state: 'trial_grace',
      graceEndsAt: dueAt,
    };
    const { manager, entitlementRepo, eventRepo } = createManager();
    entitlementRepo.find.mockResolvedValue([trial, grace]);
    const { service } = createService(manager);

    await expect(service.processExpiry(dueAt)).resolves.toEqual({
      trialGrace: 1,
      trialExpired: 1,
      paymentGrace: 0,
      paymentExpired: 0,
    });
    expect(entitlementRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'trial', state: 'trial_grace' }),
    );
    expect(entitlementRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'grace', state: 'expired' }),
    );
    expect(eventRepo.save).toHaveBeenCalledTimes(2);
  });

  it('is harmless when a duplicate scheduler run has no due rows', async () => {
    const { manager, entitlementRepo, eventRepo } = createManager();
    entitlementRepo.find.mockResolvedValue([]);
    const { service } = createService(manager);

    await expect(
      service.processExpiry(new Date('2026-08-01T00:00:00.000Z')),
    ).resolves.toEqual({
      trialGrace: 0,
      trialExpired: 0,
      paymentGrace: 0,
      paymentExpired: 0,
    });
    expect(entitlementRepo.save).not.toHaveBeenCalled();
    expect(eventRepo.save).not.toHaveBeenCalled();
  });

  it('locks expiry and payment activation rows before transition', async () => {
    const { manager, entitlementRepo } = createManager();
    entitlementRepo.find.mockResolvedValue([]);
    entitlementRepo.findOne.mockResolvedValue({
      id: 'entitlement-1',
      tenantId: 'tenant-1',
      state: 'payment_grace',
    });
    const { service } = createService(manager);

    await service.processExpiry(new Date('2026-08-01T00:00:00.000Z'));
    expect(entitlementRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        lock: { mode: 'pessimistic_write' },
      }),
    );

    await service.activatePaidPeriod({
      tenantId: 'tenant-1',
      planId: 'plan-1',
      paidPeriodStartsAt: new Date('2026-08-01T00:00:00.000Z'),
      paidPeriodEndsAt: new Date('2026-09-01T00:00:00.000Z'),
      actor: { type: 'platform_admin', id: 'admin-1' },
      paymentEvidence: { billingRecordId: 'billing-1' },
      idempotencyKey: 'payment-activation:billing-record:billing-1',
    });
    expect(entitlementRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
  });

  it('activates a paid period and records payment evidence', async () => {
    const { manager, entitlementRepo, eventRepo } = createManager();
    entitlementRepo.findOne.mockResolvedValue({
      id: 'entitlement-1',
      tenantId: 'tenant-1',
      state: 'expired',
    });
    const { service } = createService(manager);

    await expect(
      service.activatePaidPeriod({
        tenantId: 'tenant-1',
        planId: 'plan-1',
        paidPeriodStartsAt: new Date('2026-08-01T00:00:00.000Z'),
        paidPeriodEndsAt: new Date('2026-09-01T00:00:00.000Z'),
        actor: { type: 'platform_admin', id: 'admin-1' },
        paymentEvidence: { billingRecordId: 'billing-1' },
        idempotencyKey: 'payment-activation:billing-record:billing-1',
      }),
    ).resolves.toMatchObject({
      state: 'paid_active',
      paidPeriodEndsAt: new Date('2026-09-01T00:00:00.000Z'),
      reactivationEvidence: { billingRecordId: 'billing-1' },
    });

    expect(eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        previousState: 'expired',
        newState: 'paid_active',
        idempotencyKey: 'payment-activation:billing-record:billing-1',
      }),
    );
  });
});
