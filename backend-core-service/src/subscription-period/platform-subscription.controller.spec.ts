/* eslint-disable @typescript-eslint/no-unsafe-argument -- Repository doubles keep this unit suite focused on controller behavior. */
import { HttpStatus } from '@nestjs/common';

import { PlatformSubscriptionController } from './platform-subscription.controller';
import { MissingActivePeriodError } from './subscription-entitlement.types';

function createController() {
  const entitlementService = {
    resolveActiveSubscriptionEntitlement: jest.fn(),
  };
  const reconciliationService = {
    generate: jest.fn(),
  };
  const periodRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const periodEventRepository = {
    find: jest.fn(),
  };
  const controller = new PlatformSubscriptionController(
    entitlementService as any,
    reconciliationService as any,
    periodRepository as any,
    periodEventRepository as any,
  );
  return {
    controller,
    entitlementService,
    reconciliationService,
    periodRepository,
    periodEventRepository,
  };
}

describe('PlatformSubscriptionController (Phase 5)', () => {
  it('returns the resolved effective entitlement for a tenant', async () => {
    const { controller, entitlementService } = createController();
    entitlementService.resolveActiveSubscriptionEntitlement.mockResolvedValue({
      activePeriodId: 'period-1',
      effectiveLimits: { inbound_messages: 12000 },
    });

    const result = await controller.getEntitlement('tenant-1');

    expect(result).toMatchObject({
      activePeriodId: 'period-1',
      effectiveLimits: { inbound_messages: 12000 },
    });
    expect(
      entitlementService.resolveActiveSubscriptionEntitlement,
    ).toHaveBeenCalledWith('tenant-1');
  });

  it('maps a missing active period into a structured 409 with the stable code', async () => {
    const { controller, entitlementService } = createController();
    entitlementService.resolveActiveSubscriptionEntitlement.mockRejectedValue(
      new MissingActivePeriodError(
        'NO_ACTIVE_PAID_PERIOD',
        'Tenant tenant-1 has no active paid subscription period.',
      ),
    );

    await expect(controller.getEntitlement('tenant-1')).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: {
        code: 'NO_ACTIVE_PAID_PERIOD',
        message: 'Tenant tenant-1 has no active paid subscription period.',
      },
    });
  });

  it('generates the shadow/reconciliation report for a tenant', async () => {
    const { controller, reconciliationService } = createController();
    reconciliationService.generate.mockResolvedValue({
      activePeriodId: 'period-1',
      mismatches: [],
    });

    const report = await controller.getReconciliation('tenant-1');

    expect(report).toMatchObject({ activePeriodId: 'period-1' });
    expect(reconciliationService.generate).toHaveBeenCalledWith('tenant-1');
  });

  it('returns the ordered audit/event trail for a tenant period', async () => {
    const { controller, periodRepository, periodEventRepository } =
      createController();
    periodRepository.findOne.mockResolvedValue({
      id: 'period-1',
      tenantId: 'tenant-1',
    });
    periodEventRepository.find.mockResolvedValue([
      {
        id: 'event-1',
        subscriptionPeriodId: 'period-1',
        tenantId: 'tenant-1',
        eventType: 'period_admin_activation_approved',
        previousStatus: 'pending',
        newStatus: 'approved',
        actorType: 'platform_admin',
        actorId: 'admin-1',
        source: 'admin',
        reason: 'Approved',
        createdAt: new Date('2026-09-02T00:00:00.000Z'),
      },
    ]);

    const result = await controller.getPeriodEvents('tenant-1', 'period-1');

    expect(periodRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'period-1', tenantId: 'tenant-1' },
    });
    expect(result).toMatchObject({
      periodId: 'period-1',
      tenantId: 'tenant-1',
      events: [
        expect.objectContaining({
          eventType: 'period_admin_activation_approved',
          actorId: 'admin-1',
        }),
      ],
    });
  });

  it('returns 404 for events of a period that does not belong to the tenant', async () => {
    const { controller, periodRepository } = createController();
    periodRepository.findOne.mockResolvedValue(null);

    await expect(
      controller.getPeriodEvents('tenant-1', 'period-1'),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });
});
