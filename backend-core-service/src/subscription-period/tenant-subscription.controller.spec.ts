/* eslint-disable @typescript-eslint/no-unsafe-argument -- Repository doubles keep this unit suite focused on controller behavior. */
import { TenantSubscriptionController } from './tenant-subscription.controller';
import { MissingActivePeriodError } from './subscription-entitlement.types';

function createController() {
  const entitlementService = {
    resolveActiveSubscriptionEntitlement: jest.fn(),
  };
  const periodRepository = {
    find: jest.fn().mockResolvedValue([]),
  };
  const usageRepository = {
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    })),
  };
  const channelRepository = {
    find: jest.fn().mockResolvedValue([]),
  };
  const userRepository = {
    count: jest.fn().mockResolvedValue(0),
  };
  const tenantRepository = {
    findOne: jest.fn().mockResolvedValue(null),
  };
  const controller = new TenantSubscriptionController(
    periodRepository as any,
    usageRepository as any,
    channelRepository as any,
    userRepository as any,
    tenantRepository as any,
    entitlementService as any,
  );
  return {
    controller,
    entitlementService,
    periodRepository,
    usageRepository,
    channelRepository,
    userRepository,
    tenantRepository,
  };
}

describe('TenantSubscriptionController periods usage', () => {
  it('counts a successfully created pending channel immediately in period usage', async () => {
    const { controller, entitlementService, channelRepository } =
      createController();
    entitlementService.resolveActiveSubscriptionEntitlement.mockResolvedValue({
      activePeriodId: 'period-1',
      periodType: 'paid',
      periodStatus: 'active',
      effectiveLimits: {},
    });
    channelRepository.find.mockResolvedValue([
      { id: 'fresh', status: 'pending', connectionStatus: 'ready' },
      { id: 'established', status: 'active' },
      { id: 'failed', status: 'pending', connectionStatus: 'error' },
      { id: 'disabled', status: 'disabled' },
    ]);

    const result = await controller.getPeriods({ id: 'tenant-1' });

    expect(channelRepository.find).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
    });
    expect(result.periodUsage).toMatchObject({
      activeChannels: 2,
      activeTeamMembers: 0,
    });
  });

  it('maps a missing active period into a structured error and an empty usage ledger', async () => {
    const { controller, entitlementService } = createController();
    entitlementService.resolveActiveSubscriptionEntitlement.mockRejectedValue(
      new MissingActivePeriodError(
        'NO_ACTIVE_PAID_PERIOD',
        'Tenant tenant-1 has no active paid subscription period.',
      ),
    );

    const result = await controller.getPeriods({ id: 'tenant-1' });

    expect(result).toMatchObject({
      tenantId: 'tenant-1',
      activePeriodId: null,
      entitlement: null,
      entitlementError: {
        code: 'NO_ACTIVE_PAID_PERIOD',
        message: 'Tenant tenant-1 has no active paid subscription period.',
      },
      periodUsage: {
        inboundMessages: 0,
        outboundMessages: 0,
        apiRequests: 0,
        activeChannels: 0,
      },
    });
  });
});
