import { TenantController } from './tenant.controller';
import { ALLOW_EXPIRED_ACCESS_KEY } from '../common/decorators/allow-expired-access.decorator';
import { MissingActivePeriodError } from '../subscription-period/subscription-entitlement.types';
import { HttpException, HttpStatus } from '@nestjs/common';

function createController() {
  const tenantService = {};
  const telegramManagedBotService = {};
  const usageLimitService = {
    getUsageSummary: jest.fn(),
  };
  const controller = new TenantController(
    tenantService as any,
    telegramManagedBotService as any,
    usageLimitService as any,
  );
  return { controller, usageLimitService };
}

describe('TenantController billing permissions', () => {
  it('exposes subscription purchase requests only to billing roles and allows expired recovery', () => {
    const roles = Reflect.getMetadata(
      'roles',
      TenantController.prototype.createSubscriptionPurchaseRequest,
    );
    expect(roles).toEqual(
      expect.arrayContaining(['owner', 'admin', 'supervisor', 'finance']),
    );
    expect(roles).not.toContain('csr');
    expect(roles).not.toContain('delivery');
    expect(
      Reflect.getMetadata(
        ALLOW_EXPIRED_ACCESS_KEY,
        TenantController.prototype.createSubscriptionPurchaseRequest,
      ),
    ).toBe(true);
  });

  it('exposes billing overview only to billing roles', () => {
    const roles = Reflect.getMetadata(
      'roles',
      TenantController.prototype.getTenantBilling,
    );

    expect(roles).toEqual(
      expect.arrayContaining(['owner', 'admin', 'supervisor', 'finance']),
    );
    expect(roles).not.toContain('csr');
    expect(roles).not.toContain('delivery');
  });

  it('keeps plan change requests within the same billing role boundary', () => {
    const createRoles = Reflect.getMetadata(
      'roles',
      TenantController.prototype.requestPlanChange,
    );
    const listRoles = Reflect.getMetadata(
      'roles',
      TenantController.prototype.listPlanChangeRequests,
    );
    const cancelRoles = Reflect.getMetadata(
      'roles',
      TenantController.prototype.cancelPlanChangeRequest,
    );

    expect(createRoles).toEqual(
      expect.arrayContaining(['owner', 'admin', 'supervisor', 'finance']),
    );
    expect(listRoles).toEqual(createRoles);
    expect(cancelRoles).toEqual(createRoles);
  });

  it('keeps tenant settings updates narrower than billing visibility', () => {
    const roles = Reflect.getMetadata(
      'roles',
      TenantController.prototype.updateTenantSettings,
    );

    expect(roles).toEqual(['owner', 'admin']);
  });

  it('keeps billing recovery writes available after entitlement expiry', () => {
    expect(
      Reflect.getMetadata(
        ALLOW_EXPIRED_ACCESS_KEY,
        TenantController.prototype.submitPaymentProof,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        ALLOW_EXPIRED_ACCESS_KEY,
        TenantController.prototype.requestPlanChange,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        ALLOW_EXPIRED_ACCESS_KEY,
        TenantController.prototype.cancelPlanChangeRequest,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        ALLOW_EXPIRED_ACCESS_KEY,
        TenantController.prototype.listPlanChangeRequests,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        ALLOW_EXPIRED_ACCESS_KEY,
        TenantController.prototype.getTenantBilling,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        ALLOW_EXPIRED_ACCESS_KEY,
        TenantController.prototype.getTenantSettings,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        ALLOW_EXPIRED_ACCESS_KEY,
        TenantController.prototype.requestDataExport,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(
        ALLOW_EXPIRED_ACCESS_KEY,
        TenantController.prototype.createChannel,
      ),
    ).toBeUndefined();
  });

  it('restricts channel retention and reactivation to tenant owner/admin roles', () => {
    const retentionRoles = Reflect.getMetadata(
      'roles',
      TenantController.prototype.setChannelRetentionSelection,
    );
    const reactivationRoles = Reflect.getMetadata(
      'roles',
      TenantController.prototype.reactivateChannel,
    );

    expect(retentionRoles).toEqual(['owner', 'admin']);
    expect(reactivationRoles).toEqual(retentionRoles);
    expect(retentionRoles).not.toContain('csr');
    expect(retentionRoles).not.toContain('finance');
  });
});

describe('TenantController.getUsageSummary', () => {
  it('returns the usage summary for an active period', async () => {
    const { controller, usageLimitService } = createController();
    const summary = {
      tenantId: 'tenant-1',
      scope: 'period_scoped',
      activePeriodId: 'period-1',
      planId: 'plan-a',
      periodStart: '2026-08-01T00:00:00.000Z',
      periodEnd: '2026-08-31T23:59:59.999Z',
      baseLimits: { inbound_messages: 10000, outbound_messages: 10000, api_requests: 5000, channel_slots: 5, storage_gb: 10, team_members: 3 },
      activeTopUpComponentTotals: { inbound_messages: 0, outbound_messages: 0, api_requests: 0, channel_slots: 0, storage_gb: 0, team_members: 0 },
      effectiveLimits: { inbound_messages: 10000, outbound_messages: 10000, api_requests: 5000, channel_slots: 5, storage_gb: 10, team_members: 3 },
      apiRequests: { used: 100, limit: 5000, remaining: 4900, limitReached: false },
      inboundMessages: { used: 250, limit: 10000, remaining: 9750, limitReached: false },
      outboundMessages: { used: 50, limit: 10000, remaining: 9950, limitReached: false },
    };
    usageLimitService.getUsageSummary.mockResolvedValue(summary);

    const result = await controller.getUsageSummary({ id: 'tenant-1' });

    expect(result).toEqual(summary);
    expect(usageLimitService.getUsageSummary).toHaveBeenCalledWith('tenant-1');
  });

  it('throws 409 SUBSCRIPTION_PAYMENT_REQUIRED when payment is not confirmed', async () => {
    const { controller, usageLimitService } = createController();
    const error = new MissingActivePeriodError(
      'PERIOD_PAYMENT_NOT_CONFIRMED',
      'Confirmed payment is required for the active period.',
    );
    usageLimitService.getUsageSummary.mockRejectedValue(error);

    await expect(
      controller.getUsageSummary({ id: 'tenant-1' }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: 'SUBSCRIPTION_PAYMENT_REQUIRED' },
    });
  });

  it('throws 409 SUBSCRIPTION_PERIOD_AWAITING_ACTIVATION when awaiting admin activation', async () => {
    const { controller, usageLimitService } = createController();
    const error = new MissingActivePeriodError(
      'PERIOD_AWAITING_ADMIN_ACTIVATION',
      'Payment is confirmed but the subscription period awaits Platform Admin activation.',
    );
    usageLimitService.getUsageSummary.mockRejectedValue(error);

    await expect(
      controller.getUsageSummary({ id: 'tenant-1' }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: 'SUBSCRIPTION_PERIOD_AWAITING_ACTIVATION' },
    });
  });

  it('throws 409 TRIAL_EXPIRED when trial period has ended', async () => {
    const { controller, usageLimitService } = createController();
    const error = new MissingActivePeriodError(
      'TRIAL_EXPIRED',
      'The trial period has ended.',
    );
    usageLimitService.getUsageSummary.mockRejectedValue(error);

    await expect(
      controller.getUsageSummary({ id: 'tenant-1' }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: 'TRIAL_EXPIRED' },
    });
  });

  it('throws 409 SUBSCRIPTION_PERIOD_NOT_ACTIVE for other missing period codes', async () => {
    const { controller, usageLimitService } = createController();
    const error = new MissingActivePeriodError(
      'NO_ACTIVE_PAID_PERIOD',
      'No active paid period found.',
    );
    usageLimitService.getUsageSummary.mockRejectedValue(error);

    await expect(
      controller.getUsageSummary({ id: 'tenant-1' }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: 'SUBSCRIPTION_PERIOD_NOT_ACTIVE' },
    });
  });

  it('re-throws non-entitlement errors unchanged', async () => {
    const { controller, usageLimitService } = createController();
    const error = new Error('database connection lost');
    usageLimitService.getUsageSummary.mockRejectedValue(error);

    await expect(
      controller.getUsageSummary({ id: 'tenant-1' }),
    ).rejects.toThrow('database connection lost');
  });

  it('exposes usage-summary only to billing roles and allows expired access', () => {
    const roles = Reflect.getMetadata(
      'roles',
      TenantController.prototype.getUsageSummary,
    );
    expect(roles).toEqual(
      expect.arrayContaining(['owner', 'admin', 'supervisor', 'finance']),
    );
    expect(roles).not.toContain('csr');
    expect(roles).not.toContain('delivery');
    expect(
      Reflect.getMetadata(
        ALLOW_EXPIRED_ACCESS_KEY,
        TenantController.prototype.getUsageSummary,
      ),
    ).toBe(true);
  });
});
