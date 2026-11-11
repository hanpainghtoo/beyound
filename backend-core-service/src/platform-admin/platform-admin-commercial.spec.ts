import { PlatformAdminService } from './platform-admin.service';
import { yangonWallClockToUtc } from '../subscription-period/yangon-month.util';

function createRepository(overrides: Record<string, any> = {}) {
  const repository: Record<string, any> = {
    count: jest.fn(async () => 0),
    create: jest.fn((value) => value),
    find: jest.fn(async () => []),
    findOne: jest.fn(),
    remove: jest.fn(async (value) => value),
    save: jest.fn(async (value) => ({ id: value.id || 'saved-id', ...value })),
    createQueryBuilder: jest.fn(),
    ...overrides,
  };
  repository.manager = {
    create: jest.fn((_entity, value) => value),
    save: jest.fn(async (_entity, value) => ({
      id: value.id || 'saved-id',
      ...value,
    })),
    getRepository: jest.fn(() => repository),
    transaction: jest.fn(async (callback) => callback(repository.manager)),
  };
  return repository;
}

function createQueryBuilder(overrides: Record<string, any> = {}) {
  return {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(async () => ({ total: '0' })),
    getRawMany: jest.fn(async () => []),
    ...overrides,
  };
}

function createService() {
  const repositories = {
    tenant: createRepository(),
    subscriptionPlan: createRepository(),
    platformAdmin: createRepository(),
    tenantUser: createRepository(),
    tenantAnalytics: createRepository(),
    tenantChannel: createRepository(),
    conversation: createRepository(),
    order: createRepository(),
    product: createRepository(),
    tenantRateLimit: createRepository(),
    platformSetting: createRepository(),
    tenantUsage: createRepository(),
    tenantBillingRecord: createRepository(),
    subscriptionPeriod: createRepository(),
    tenantEntitlement: createRepository(),
    lead: createRepository(),
  };

  repositories.tenant.findOne.mockResolvedValue({
    id: 'tenant-1',
    tenantCode: 'KME',
    companyName: 'KME Test',
    status: 'active',
    subscriptionPlanId: 'plan-1',
    subscriptionStartDate: new Date('2026-06-01T00:00:00.000Z'),
    subscriptionEndDate: new Date('2026-07-01T00:00:00.000Z'),
    customAgentLimit: null,
    customChannelLimit: null,
    customMessageLimit: null,
  });
  repositories.subscriptionPlan.findOne.mockResolvedValue({
    id: 'plan-1',
    name: 'Growth',
    monthlyPrice: 50000,
    maxAgents: 5,
    maxChannels: 3,
    messageLimit: 10,
  });
  (repositories.tenantUser.find as jest.Mock).mockResolvedValue([
    { id: 'owner-1', role: 'owner', status: 'active' },
    { id: 'finance-1', role: 'finance', status: 'active' },
    { id: 'agent-1', role: 'agent', status: 'active' },
  ]);
  const notificationService = {
    createMany: jest.fn(async (rows) => rows),
  };
  const entitlementService = {
    activatePaidPeriod: jest.fn(),
    createInitialTrial: jest.fn(),
    transition: jest.fn(),
  };
  const subscriptionPeriodService = {
    resolveActiveTrialPlan: jest.fn(async () => ({
      id: 'plan-trial',
      name: 'Guided Pilot (Trial)',
      planType: 'trial',
      durationDays: 30,
    })),
    ensureTrialPeriodForTenant: jest.fn(async (tenantId: string) => ({
      id: 'trial-period-1',
      tenantId,
      planId: 'plan-trial',
      periodType: 'trial',
      periodStatus: 'active',
      paymentStatus: 'not_required',
      adminActivationStatus: 'approved',
      durationDays: 30,
      periodStartAt: new Date('2026-08-17T00:00:00.000Z'),
      periodEndAt: new Date('2026-09-16T00:00:00.000Z'),
    })),
    ensurePaidBillingPeriod: jest.fn(async (input: any) => ({
      id: 'period-1',
      tenantId: input.tenantId,
      planId: input.plan.id,
      periodStatus: input.periodStatus,
      paymentStatus: input.paymentStatus,
      adminActivationStatus: input.adminActivationStatus,
    })),
    adminApprovePeriod: jest.fn(async (tenantId: string, periodId: string) => {
      const record = await repositories.tenantBillingRecord.findOne({
        where: { id: 'billing-1', tenantId },
      });
      return {
        period: {
          id: periodId,
          tenantId,
          planId: record?.subscriptionPlanId ?? 'plan-1',
          periodType: 'paid',
          periodStatus: 'active',
          paymentStatus: 'paid',
          adminActivationStatus: 'approved',
          adminActivatedAt: new Date(),
          adminActivatedBy: 'operator-1',
          adminActivationReason: undefined,
          monthStartAt: new Date('2026-08-01'),
          monthEndAt: new Date('2026-09-01'),
          billingRecordId: 'billing-1',
        },
        operational: true,
      };
    }),
  };

  const service = new PlatformAdminService(
    repositories.tenant as any,
    repositories.subscriptionPlan as any,
    repositories.platformAdmin as any,
    repositories.tenantUser as any,
    repositories.tenantAnalytics as any,
    repositories.tenantChannel as any,
    repositories.conversation as any,
    repositories.order as any,
    repositories.product as any,
    repositories.tenantRateLimit as any,
    repositories.platformSetting as any,
    repositories.tenantUsage as any,
    repositories.tenantBillingRecord as any,
    repositories.subscriptionPeriod as any,
    repositories.tenantEntitlement as any,
    repositories.lead as any,
    notificationService as any,
    entitlementService as any,
    {
      issueTenantUserInvite: jest.fn().mockResolvedValue({
        message: 'Team invitation requested',
        invitationDelivery: 'requested',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    } as any,
    subscriptionPeriodService as any,
    { getBillingProofDownloadUrl: jest.fn() } as any,
  );

  return {
    service,
    repositories,
    notificationService,
    entitlementService,
    subscriptionPeriodService,
  };
}

describe('PlatformAdminService commercial operations', () => {
  it('does not auto-create a legacy trial when approving a tenant', async () => {
    const { service, repositories, entitlementService } = createService();
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      tenantCode: 'KME',
      status: 'pending',
      subscriptionPlanId: null,
      subscriptionStartDate: null,
      subscriptionEndDate: null,
    });
    repositories.tenant.save.mockImplementation(async (value) => ({
      ...value,
      id: 'tenant-1',
    }));
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      status: 'active',
    });

    await service.approveTenant(
      'tenant-1',
      { action: 'approved', subscriptionPlanId: 'plan-1' },
      'admin-1',
    );

    // Plan 13: merchant approval must not invent a legacy trial entitlement;
    // access enters only through a confirmed + admin-activated period.
    expect(entitlementService.createInitialTrial).not.toHaveBeenCalled();
    expect(entitlementService.activatePaidPeriod).not.toHaveBeenCalled();
  });

  it('creates manual tenant billing records with review status', async () => {
    const { service, repositories } = createService();

    await expect(
      service.createTenantBillingRecord('tenant-1', {
        invoiceNo: 'INV-00001',
        billingPeriodStart: '2026-06-01',
        billingPeriodEnd: '2026-07-01',
        reviewStatus: 'in_review',
        amountDue: 50000,
        currency: 'MMK',
      }),
    ).resolves.toMatchObject({
      tenantId: 'tenant-1',
      subscriptionPlanId: 'plan-1',
      invoiceNo: 'INV-00001',
      reviewStatus: 'in_review',
      amountDue: 50000,
      currency: 'MMK',
    });
    expect(repositories.tenantBillingRecord.save).toHaveBeenCalled();
  });

  it('emails manual invoices to the company email without blocking creation (Plan 30 E2)', async () => {
    const { service } = createService();
    const emailService = {
      sendInvoiceIssued: jest.fn().mockResolvedValue(true),
    };
    (service as any).emailService = emailService;
    (service as any).tenantRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        tenantCode: 'KME',
        companyName: 'KME Test',
        contactEmail: 'billing@kme.test',
        status: 'active',
        subscriptionPlanId: 'plan-1',
        subscriptionStartDate: new Date('2026-06-01T00:00:00.000Z'),
        subscriptionEndDate: new Date('2026-07-01T00:00:00.000Z'),
      }),
    };

    const record = await service.createTenantBillingRecord('tenant-1', {
      invoiceNo: 'INV-00002',
      billingPeriodStart: '2026-06-01',
      billingPeriodEnd: '2026-07-01',
      reviewStatus: 'in_review',
      amountDue: 50000,
      currency: 'MMK',
    });

    expect(record.invoiceNo).toBe('INV-00002');
    expect(emailService.sendInvoiceIssued).toHaveBeenCalledWith(
      'billing@kme.test',
      expect.objectContaining({
        companyName: 'KME Test',
        invoiceNo: 'INV-00002',
      }),
    );
  });

  it('rejects non-calendar-month manual billing periods', async () => {
    const { service, repositories } = createService();

    await expect(
      service.createTenantBillingRecord('tenant-1', {
        billingPeriodStart: '2026-08-15',
        billingPeriodEnd: '2026-09-15',
      }),
    ).rejects.toThrow(
      'Billing period must match one complete Asia/Yangon calendar month',
    );
    expect(repositories.tenantBillingRecord.save).not.toHaveBeenCalled();
  });

  it('rejects duplicate invoice numbers and overlapping active billing periods', async () => {
    const { service, repositories } = createService();
    repositories.tenantBillingRecord.findOne.mockResolvedValueOnce({
      id: 'billing-existing',
      invoiceNo: 'INV-00001',
    });

    await expect(
      service.createTenantBillingRecord('tenant-1', {
        invoiceNo: 'INV-00001',
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-09-01',
      }),
    ).rejects.toThrow('invoiceNo already exists');

    repositories.tenantBillingRecord.findOne.mockResolvedValueOnce(null);
    repositories.tenantBillingRecord.find.mockResolvedValueOnce([
      {
        id: 'billing-existing',
        tenantId: 'tenant-1',
        reviewStatus: 'in_review',
        billingPeriodStart: new Date('2026-08-01'),
        billingPeriodEnd: new Date('2026-09-01'),
      },
    ] as any);

    await expect(
      service.createTenantBillingRecord('tenant-1', {
        invoiceNo: 'INV-00002',
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-09-01',
      }),
    ).rejects.toThrow('Billing period overlaps');
  });

  it('ignores trial invoices in manual overlap checks', async () => {
    const { service, repositories } = createService();
    repositories.tenantBillingRecord.findOne.mockResolvedValue(null);
    repositories.tenantBillingRecord.find.mockResolvedValueOnce([
      {
        id: 'trial-invoice',
        tenantId: 'tenant-1',
        reviewStatus: 'confirm',
        billingPeriodStart: new Date('2026-08-10'),
        billingPeriodEnd: new Date('2026-08-17'),
        metadata: {
          purchaseRequestType: 'subscription_period',
          trial: true,
          zeroCost: true,
        },
      },
    ] as any);

    const record = await service.createTenantBillingRecord('tenant-1', {
      invoiceNo: 'INV-00003',
      billingPeriodStart: '2026-08-01',
      billingPeriodEnd: '2026-09-01',
      reviewStatus: 'in_review',
      amountDue: 50000,
      currency: 'MMK',
    });

    expect(record.invoiceNo).toBe('INV-00003');
  });

  it('rejects invalid billing amounts, currency, and status combinations', async () => {
    const { service } = createService();

    await expect(
      service.createTenantBillingRecord('tenant-1', {
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-09-01',
        amountDue: 50000,
        amountPaid: 60000,
      }),
    ).rejects.toThrow('amountPaid cannot exceed amountDue');

    await expect(
      service.createTenantBillingRecord('tenant-1', {
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-09-01',
        amountDue: 50000,
        amountPaid: 50000,
        reviewStatus: 'bogus' as any,
      }),
    ).rejects.toThrow('reviewStatus is not valid');

    await expect(
      service.createTenantBillingRecord('tenant-1', {
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-09-01',
        amountDue: 50000,
        amountPaid: 10000,
        reviewStatus: 'confirm',
      }),
    ).rejects.toThrow(
      'Confirmed invoices must have amountPaid equal to amountDue',
    );

    await expect(
      service.createTenantBillingRecord('tenant-1', {
        billingPeriodStart: '2026-08-01',
        billingPeriodEnd: '2026-09-01',
        currency: 'kyats',
      }),
    ).rejects.toThrow('currency must be an ISO 4217');
  });

  it('updates manual invoice review status fields', async () => {
    const { service, repositories } = createService();
    repositories.tenantBillingRecord.findOne.mockResolvedValue({
      id: 'billing-1',
      tenantId: 'tenant-1',
      subscriptionPlanId: 'plan-1',
      billingPeriodStart: new Date('2026-06-01'),
      billingPeriodEnd: new Date('2026-07-01'),
      reviewStatus: 'in_review',
      amountDue: 50000,
      amountPaid: 0,
      currency: 'MMK',
      metadata: {},
    });

    await expect(
      service.updateTenantBillingRecord('tenant-1', 'billing-1', {
        reviewStatus: 'confirm',
        amountPaid: 50000,
        paidAt: '2026-06-20T09:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      reviewStatus: 'confirm',
      amountPaid: 50000,
      paidAt: new Date('2026-06-20T09:00:00.000Z'),
    });
  });

  it('approves pending payment proof and creates the pending period once', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-20T09:00:00.000Z'));
    const {
      service,
      repositories,
      entitlementService,
      subscriptionPeriodService,
    } = createService();
    repositories.tenantBillingRecord.findOne
      .mockResolvedValueOnce({
        id: 'billing-1',
        tenantId: 'tenant-1',
        subscriptionPlanId: 'plan-1',
        invoiceNo: 'INV-00001',
        billingPeriodStart: new Date('2026-06-01'),
        billingPeriodEnd: new Date('2026-07-01'),
        reviewStatus: 'in_review',
        amountDue: 50000,
        amountPaid: 0,
        currency: 'MMK',
        metadata: {
          paymentProof: {
            id: 'proof-1',
            status: 'pending_review',
            paidAmount: 50000,
            paidDate: '2026-06-20T09:00:00.000Z',
          },
          paymentProofSubmissions: [
            { id: 'proof-1', status: 'pending_review' },
          ],
        },
      })
      .mockResolvedValueOnce({
        id: 'billing-1',
        tenantId: 'tenant-1',
        subscriptionPlanId: 'plan-1',
        invoiceNo: 'INV-00001',
        billingPeriodStart: new Date('2026-06-01'),
        billingPeriodEnd: new Date('2026-07-01'),
        reviewStatus: 'confirm',
        amountDue: 50000,
        amountPaid: 50000,
        currency: 'MMK',
        metadata: {
          paymentProof: { id: 'proof-1', status: 'confirmed' },
        },
      });

    await expect(
      service.reviewTenantPaymentProof('tenant-1', 'billing-1', 'operator-1', {
        outcome: 'confirmed',
      }),
    ).resolves.toMatchObject({
      reviewStatus: 'confirm',
      amountPaid: 50000,
      metadata: expect.objectContaining({
        paymentProof: expect.objectContaining({
          status: 'confirmed',
          reviewedBy: 'operator-1',
        }),
        paymentProofReviews: [
          expect.objectContaining({
            outcome: 'confirmed',
            reviewedBy: 'operator-1',
          }),
        ],
      }),
    });

    // Phase 2 contract: payment confirmation creates the period ledger row
    // as `pending` admin activation but does NOT project operational
    // entitlement. Platform Admin activation does that separately.
    expect(
      subscriptionPeriodService.ensurePaidBillingPeriod,
    ).toHaveBeenCalledTimes(1);
    const periodInput = (
      subscriptionPeriodService.ensurePaidBillingPeriod as jest.Mock
    ).mock.calls[0][0];
    expect(periodInput).toMatchObject({
      tenantId: 'tenant-1',
      plan: expect.objectContaining({ id: 'plan-1' }),
      paymentStatus: 'paid',
      adminActivationStatus: 'pending',
    });
    expect(entitlementService.activatePaidPeriod).not.toHaveBeenCalled();
    expect(
      repositories.tenantBillingRecord.manager.transaction,
    ).toHaveBeenCalled();

    // The same approved review is idempotent and does not duplicate periods.
    await expect(
      service.reviewTenantPaymentProof('tenant-1', 'billing-1', 'operator-1', {
        outcome: 'confirmed',
      }),
    ).resolves.toMatchObject({ reviewStatus: 'confirm' });
    expect(
      subscriptionPeriodService.ensurePaidBillingPeriod,
    ).toHaveBeenCalledTimes(1);
    expect(entitlementService.activatePaidPeriod).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('activates the pending period only after Platform Admin activation', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-11T09:00:00.000Z'));
    const { service, repositories, entitlementService } = createService();
    repositories.tenantBillingRecord.findOne.mockResolvedValue({
      id: 'billing-1',
      tenantId: 'tenant-1',
      subscriptionPlanId: 'plan-1',
      invoiceNo: 'INV-00001',
      billingPeriodStart: new Date('2026-08-01'),
      billingPeriodEnd: new Date('2026-09-01'),
      reviewStatus: 'in_review',
      amountDue: 50000,
      amountPaid: 0,
      currency: 'MMK',
      metadata: {
        paymentProof: { id: 'proof-1', status: 'pending_review' },
        paymentProofSubmissions: [{ id: 'proof-1', status: 'pending_review' }],
      },
    });

    await service.reviewTenantPaymentProof(
      'tenant-1',
      'billing-1',
      'operator-1',
      {
        outcome: 'confirmed',
      },
    );
    expect(entitlementService.activatePaidPeriod).not.toHaveBeenCalled();

    // The separate admin activation step activates the paid entitlement.
    await expect(
      service.adminActivatePeriod(
        'tenant-1',
        'period-1',
        'operator-1',
        undefined,
      ),
    ).resolves.toMatchObject({
      id: 'period-1',
      adminActivationStatus: 'approved',
      operational: true,
    });
    expect(entitlementService.activatePaidPeriod).toHaveBeenCalledTimes(1);
    expect(entitlementService.activatePaidPeriod).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        planId: 'plan-1',
        idempotencyKey: 'admin-period-activation:period-1',
      }),
    );
    jest.useRealTimers();
  });

  it('reverses a confirmed payment only through the dedicated stronger path', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-18T00:00:00.000Z'));
    const { service, repositories } = createService();
    repositories.tenantBillingRecord.findOne.mockResolvedValue({
      id: 'billing-1',
      tenantId: 'tenant-1',
      subscriptionPlanId: 'plan-1',
      billingPeriodStart: new Date('2026-06-01'),
      billingPeriodEnd: new Date('2026-07-01'),
      reviewStatus: 'confirm',
      amountDue: 50000,
      amountPaid: 50000,
      currency: 'MMK',
      paidAt: new Date('2026-06-20T09:00:00.000Z'),
      metadata: {},
    });

    await expect(
      service.reverseTenantBillingPayment(
        'tenant-1',
        'billing-1',
        'super-1',
        'Bank transfer was charged back',
      ),
    ).resolves.toMatchObject({
      reviewStatus: 'in_review',
      amountPaid: 0,
      paidAt: null,
      metadata: {},
    });

    expect(repositories.tenantBillingRecord.manager.save).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('cancels a linked in-flight upgrade revision when reversing its payment (Plan 54)', async () => {
    const { service, repositories } = createService();
    repositories.tenantBillingRecord.findOne.mockResolvedValue({
      id: 'billing-1',
      tenantId: 'tenant-1',
      subscriptionPlanId: 'plan-1',
      billingPeriodStart: new Date('2026-06-01'),
      billingPeriodEnd: new Date('2026-07-01'),
      reviewStatus: 'confirm',
      amountDue: 50000,
      amountPaid: 50000,
      currency: 'MMK',
      paidAt: new Date('2026-06-20T09:00:00.000Z'),
      metadata: { purchaseRequestType: 'upgrade' },
    });
    const revision = {
      id: 'rev-1',
      tenantId: 'tenant-1',
      billingRecordId: 'billing-1',
      upgradeStatus: 'pending_approval',
    };
    const revisionRepository = createRepository();
    revisionRepository.findOne.mockResolvedValue(revision);
    repositories.tenantBillingRecord.manager.getRepository = jest.fn(
      (entity: { name?: string }) =>
        entity.name === 'TenantSubscriptionPeriodUpgradeRevision'
          ? revisionRepository
          : repositories.tenantBillingRecord,
    );

    await expect(
      service.reverseTenantBillingPayment(
        'tenant-1',
        'billing-1',
        'super-1',
        'Bank transfer was charged back',
      ),
    ).resolves.toMatchObject({
      reviewStatus: 'in_review',
      amountPaid: 0,
    });

    expect(revision.upgradeStatus).toBe('cancelled');
    expect(revisionRepository.save).toHaveBeenCalled();
  });

  it('rejects pending payment proof with a safe reason without activating entitlement', async () => {
    const { service, repositories, entitlementService } = createService();
    repositories.tenantBillingRecord.findOne.mockResolvedValue({
      id: 'billing-1',
      tenantId: 'tenant-1',
      subscriptionPlanId: 'plan-1',
      billingPeriodStart: new Date('2026-06-01'),
      billingPeriodEnd: new Date('2026-07-01'),
      reviewStatus: 'in_review',
      amountDue: 50000,
      amountPaid: 0,
      currency: 'MMK',
      metadata: {
        paymentProof: { id: 'proof-1', status: 'pending_review' },
        paymentProofSubmissions: [{ id: 'proof-1', status: 'pending_review' }],
      },
    });

    await expect(
      service.reviewTenantPaymentProof('tenant-1', 'billing-1', 'operator-1', {
        outcome: 'rejected',
        safeReason: 'Reference number could not be matched',
      }),
    ).resolves.toMatchObject({
      // Plan 28 Item 1: proof rejection stays proof-level; invoice axis untouched.
      reviewStatus: 'in_review',
      actionBy: 'operator-1',
      metadata: expect.objectContaining({
        paymentProof: expect.objectContaining({
          status: 'rejected',
          rejectionReason: 'Reference number could not be matched',
        }),
      }),
    });

    expect(entitlementService.activatePaidPeriod).not.toHaveBeenCalled();
  });

  it('confirms a resubmitted proof after a prior rejection without transition errors', async () => {
    const { service, repositories } = createService();
    repositories.tenantBillingRecord.findOne.mockResolvedValue({
      id: 'billing-1',
      tenantId: 'tenant-1',
      subscriptionPlanId: 'plan-1',
      billingPeriodStart: new Date('2026-06-01'),
      billingPeriodEnd: new Date('2026-07-01'),
      reviewStatus: 'in_review',
      amountDue: 50000,
      amountPaid: 0,
      currency: 'MMK',
      metadata: {
        paymentProof: { id: 'proof-2', status: 'pending_review' },
        paymentProofSubmissions: [
          { id: 'proof-1', status: 'rejected' },
          { id: 'proof-2', status: 'pending_review' },
        ],
      },
    });

    await expect(
      service.reviewTenantPaymentProof('tenant-1', 'billing-1', 'operator-1', {
        outcome: 'confirmed',
        amountPaid: 50000,
        paidAt: '2026-07-20T09:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      reviewStatus: 'confirm',
      amountPaid: 50000,
    });
  });

  it('approves payment proof when database decimal amounts are returned as strings', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-11T09:00:00.000Z'));
    const { service, repositories, entitlementService } = createService();
    repositories.tenantBillingRecord.findOne
      .mockResolvedValueOnce({
        id: 'billing-decimal',
        tenantId: 'tenant-1',
        subscriptionPlanId: 'plan-1',
        billingPeriodStart: new Date('2026-08-01'),
        billingPeriodEnd: new Date('2026-09-01'),
        reviewStatus: 'in_review',
        amountDue: '10000.00',
        amountPaid: '0.00',
        currency: 'MMK',
        metadata: {
          paymentProof: {
            id: 'proof-decimal',
            status: 'pending_review',
            paidAmount: 10000,
            paidDate: '2026-08-11T00:00:00.000Z',
          },
          paymentProofSubmissions: [
            { id: 'proof-decimal', status: 'pending_review' },
          ],
        },
      })
      .mockResolvedValueOnce({
        id: 'billing-decimal',
        tenantId: 'tenant-1',
        subscriptionPlanId: 'plan-1',
        billingPeriodStart: new Date('2026-08-01'),
        billingPeriodEnd: new Date('2026-09-01'),
        reviewStatus: 'confirm',
        amountDue: '10000.00',
        amountPaid: '10000.00',
        currency: 'MMK',
        metadata: {
          paymentProof: { id: 'proof-decimal', status: 'confirmed' },
        },
      });

    await expect(
      service.reviewTenantPaymentProof(
        'tenant-1',
        'billing-decimal',
        'operator-1',
        {
          outcome: 'confirmed',
          amountPaid: 10000,
          paidAt: '2026-08-11T00:00:00.000Z',
        },
      ),
    ).resolves.toMatchObject({
      reviewStatus: 'confirm',
      amountDue: '10000.00',
      amountPaid: 10000,
    });
    // Payment confirmation creates the pending period; entitlement activation
    // is deferred to the separate Platform Admin activation step.
    expect(entitlementService.activatePaidPeriod).not.toHaveBeenCalled();
    await expect(
      service.adminActivatePeriod(
        'tenant-1',
        'period-1',
        'operator-1',
        undefined,
      ),
    ).resolves.toMatchObject({ adminActivationStatus: 'approved' });
    expect(entitlementService.activatePaidPeriod).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('detects seeded billing, entitlement, and usage reconciliation inconsistencies', async () => {
    const { service, repositories } = createService();
    repositories.tenantBillingRecord.find.mockResolvedValue([
      {
        id: 'billing-1',
        tenantId: 'tenant-1',
        subscriptionPlanId: 'plan-old',
        invoiceNo: 'INV-00001',
        billingPeriodStart: new Date('2026-07-01'),
        billingPeriodEnd: new Date('2026-08-01'),
        reviewStatus: 'confirm',
        amountDue: 50000,
        amountPaid: 50000,
        currency: 'MMK',
        paidAt: new Date('2026-07-05T00:00:00.000Z'),
      },
    ] as any);
    repositories.tenantEntitlement.findOne.mockResolvedValue({
      id: 'entitlement-1',
      tenantId: 'tenant-1',
      planId: 'plan-current',
      state: 'paid_active',
      paidPeriodStartsAt: new Date('2026-07-01'),
      paidPeriodEndsAt: new Date('2026-08-01'),
      graceEndsAt: null,
    });
    repositories.tenantUsage.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total: '12' }),
    });

    await expect(
      service.getTenantBillingReconciliation('tenant-1'),
    ).resolves.toMatchObject({
      reportType: 'tenant_billing_reconciliation',
      format: 'safe_json',
      tenant: { id: 'tenant-1', tenantCode: 'KME', status: 'active' },
      invoices: [
        expect.objectContaining({
          id: 'billing-1',
          invoiceNo: 'INV-00001',
          reviewStatus: 'confirm',
        }),
      ],
      entitlement: expect.objectContaining({
        id: 'entitlement-1',
        planId: 'plan-current',
        state: 'paid_active',
      }),
      usage: expect.objectContaining({
        providerMessagesUsed: 12,
      }),
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'APPROVED_INVOICE_PLAN_MISMATCH',
          severity: 'critical',
        }),
        expect.objectContaining({
          code: 'ACTIVE_ENTITLEMENT_WITHOUT_MATCHING_APPROVED_INVOICE',
          severity: 'critical',
        }),
      ]),
      summary: expect.objectContaining({
        consistent: false,
        issueCount: 2,
      }),
      manualCorrectionWorkflow: expect.arrayContaining([
        expect.stringContaining(
          'Do not delete, rewrite, or overwrite financial evidence',
        ),
      ]),
    });
  });

  it('keeps confirmed billing financial fields immutable', async () => {
    const { service, repositories } = createService();
    repositories.tenantBillingRecord.findOne.mockResolvedValue({
      id: 'billing-1',
      tenantId: 'tenant-1',
      subscriptionPlanId: 'plan-1',
      invoiceNo: 'INV-PAID',
      billingPeriodStart: new Date('2026-06-01'),
      billingPeriodEnd: new Date('2026-07-01'),
      reviewStatus: 'confirm',
      amountDue: 50000,
      amountPaid: 50000,
      currency: 'MMK',
      metadata: {},
    });

    await expect(
      service.updateTenantBillingRecord('tenant-1', 'billing-1', {
        amountDue: 45000,
      }),
    ).rejects.toThrow('Confirmed billing records cannot change amountDue');
    expect(repositories.tenantBillingRecord.save).not.toHaveBeenCalled();
  });

  it('changes a tenant plan and creates a launch billing record by default', async () => {
    const { service, repositories } = createService();
    repositories.lead.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.changeTenantSubscriptionPlan('tenant-1', {
        subscriptionPlanId: 'plan-1',
        subscriptionStartDate: '2026-06-01',
        subscriptionEndDate: '2026-07-01',
        customMessageLimit: 200,
      }),
    ).resolves.toMatchObject({
      previousPlanId: 'plan-1',
      subscriptionPlan: { id: 'plan-1' },
      billingRecord: {
        tenantId: 'tenant-1',
        reviewStatus: 'in_review',
        amountDue: 50000,
      },
    });
    expect(repositories.tenant.save).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionPlanId: 'plan-1',
        customMessageLimit: 200,
      }),
    );
  });

  it('rejects non-calendar-month plan changes', async () => {
    const { service, repositories } = createService();

    await expect(
      service.changeTenantSubscriptionPlan('tenant-1', {
        subscriptionPlanId: 'plan-1',
        subscriptionStartDate: '2026-08-15',
        subscriptionEndDate: '2026-09-15',
      }),
    ).rejects.toThrow(
      'Billing period must match one complete Asia/Yangon calendar month',
    );
    expect(repositories.tenant.save).not.toHaveBeenCalled();
  });

  it('approves an open workspace plan change request when ops applies the plan', async () => {
    const { service, repositories } = createService();
    const openPlanChangeRequest = {
      id: 'lead-1',
      source: 'workspace-plan-change',
      status: 'qualified',
      metadata: {
        requestType: 'plan_change',
        tenantId: 'tenant-1',
        desiredPlanId: 'plan-1',
        desiredPlanName: 'Growth',
      },
    };
    repositories.lead.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(openPlanChangeRequest),
    });

    await service.changeTenantSubscriptionPlan('tenant-1', {
      subscriptionPlanId: 'plan-1',
      subscriptionStartDate: '2026-06-01',
      subscriptionEndDate: '2026-07-01',
    });

    expect(repositories.lead.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'lead-1',
        status: 'converted',
        metadata: expect.objectContaining({
          outcome: 'approved',
          appliedPlanId: 'plan-1',
          appliedPlanName: 'Growth',
        }),
      }),
    );
  });

  it('returns tenant usage summaries and limit warnings', async () => {
    const { service, repositories } = createService();
    repositories.tenantUser.count.mockResolvedValue(4);
    repositories.tenantChannel.count.mockResolvedValue(2);
    repositories.tenantUsage.createQueryBuilder
      .mockReturnValueOnce(
        createQueryBuilder({
          getRawOne: jest.fn(async () => ({ total: '9' })),
        }),
      )
      .mockReturnValueOnce(
        createQueryBuilder({
          getRawMany: jest.fn(async () => [
            {
              provider: 'telegram',
              channelId: 'channel-1',
              direction: 'outbound',
              total: '9',
            },
          ]),
        }),
      )
      .mockReturnValueOnce(
        createQueryBuilder({
          getRawOne: jest.fn(async () => ({
            latest: '2026-06-15T10:00:00.000Z',
          })),
        }),
      );

    await expect(
      service.getTenantUsageAndLimits('tenant-1'),
    ).resolves.toMatchObject({
      period: {
        start: expect.any(String),
        end: expect.any(String),
      },
      refreshedAt: expect.any(String),
      usageSource: 'tenant_usage_events',
      latestUsageEventAt: '2026-06-15T10:00:00.000Z',
      usage: {
        agents: 4,
        channels: 2,
        providerMessages: 9,
      },
      limits: {
        agents: 5,
        channels: 3,
        providerMessages: 10,
      },
      metrics: {
        agents: expect.objectContaining({ key: 'agents', used: 4, limit: 5 }),
        channels: expect.objectContaining({
          key: 'channels',
          used: 2,
          limit: 3,
        }),
        providerMessages: expect.objectContaining({
          key: 'providerMessages',
          used: 9,
          limit: 10,
          lastRecordedAt: '2026-06-15T10:00:00.000Z',
        }),
      },
      warnings: expect.arrayContaining([
        expect.objectContaining({ metric: 'agents', severity: 'warning' }),
        expect.objectContaining({
          metric: 'providerMessages',
          severity: 'warning',
        }),
      ]),
      providerBreakdown: [
        {
          provider: 'telegram',
          channelId: 'channel-1',
          direction: 'outbound',
          used: 9,
        },
      ],
    });
  });

  it('projects public subscription plans without inferred commercial behavior', async () => {
    const { service, repositories } = createService();
    (repositories.subscriptionPlan.find as jest.Mock).mockResolvedValue([
      {
        id: 'plan-1',
        name: 'Professional',
        description: 'Growth package',
        monthlyPrice: 50000,
        durationDays: 30,
        messageQuotaMode: 'combined',
        maxAgents: 5,
        maxChannels: 3,
        messageLimit: 10,
        storageLimitGb: 1,
        status: 'active',
        features: {
          public: {
            displayOrder: 2,
            targetCustomer: 'Growing teams',
            recommended: true,
            selfServe: true,
            ctaLabel: 'Start now',
            currencyCode: 'MMK',
            billingInterval: 'monthly',
            featureList: ['Unified inbox', 'Orders'],
          },
        },
      },
      {
        id: 'plan-2',
        name: 'Enterprise',
        description: 'Custom rollout',
        monthlyPrice: 0,
        durationDays: 30,
        messageQuotaMode: 'combined',
        maxAgents: 50,
        maxChannels: 20,
        messageLimit: 1000,
        storageLimitGb: 50,
        status: 'active',
        features: {
          public: {
            selfServe: false,
            availability: 'contact-only',
          },
        },
      },
      {
        id: 'plan-3',
        name: 'Business',
        description: 'Operator-managed only until configured',
        monthlyPrice: 120000,
        durationDays: 14,
        messageQuotaMode: 'directional',
        maxAgents: 12,
        maxChannels: 8,
        messageLimit: 100,
        inboundMessageLimit: 80,
        outboundMessageLimit: 20,
        storageLimitGb: 10,
        status: 'active',
        features: {},
      },
    ]);

    await expect(service.getPublicSubscriptionPlans()).resolves.toEqual([
      expect.objectContaining({
        id: 'plan-1',
        durationDays: 30,
        messageQuotaMode: 'combined',
        public: expect.objectContaining({
          displayOrder: 2,
          targetCustomer: 'Growing teams',
          recommended: true,
          selfServe: true,
          ctaLabel: 'Start now',
          currencyCode: 'MMK',
          billingInterval: 'monthly',
          featureList: ['Unified inbox', 'Orders'],
          availability: 'enabled',
        }),
      }),
      expect.objectContaining({
        id: 'plan-2',
        public: expect.objectContaining({
          selfServe: false,
          availability: 'contact-only',
        }),
      }),
      expect.objectContaining({
        id: 'plan-3',
        public: expect.objectContaining({
          recommended: false,
          selfServe: false,
          featureList: [],
          availability: 'enabled',
        }),
      }),
    ]);
  });

  it('returns a single visible public plan by id (Plan 30 D1)', async () => {
    const { service, repositories } = createService();
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      name: 'Business Launch',
      status: 'active',
      planType: 'business',
      requestable: true,
      features: {},
    });

    await expect(
      service.getPublicSubscriptionPlanById('plan-1'),
    ).resolves.toMatchObject({ id: 'plan-1', name: 'Business Launch' });
    expect(repositories.subscriptionPlan.findOne).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
    });
  });

  it('hides invisible, trial, inactive, and missing plans by id (Plan 30 D1)', async () => {
    const { service, repositories } = createService();
    repositories.subscriptionPlan.findOne
      .mockResolvedValueOnce({
        id: 'plan-hidden',
        status: 'active',
        planType: 'business',
        requestable: true,
        features: { public: { visible: false } },
      })
      .mockResolvedValueOnce({
        id: 'plan-trial',
        status: 'active',
        planType: 'trial',
        requestable: true,
        features: {},
      })
      .mockResolvedValueOnce({
        id: 'plan-archived',
        status: 'archived',
        planType: 'business',
        requestable: true,
        features: {},
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.getPublicSubscriptionPlanById('plan-hidden'),
    ).rejects.toThrow('Subscription plan not found');
    await expect(
      service.getPublicSubscriptionPlanById('plan-trial'),
    ).rejects.toThrow('Subscription plan not found');
    await expect(
      service.getPublicSubscriptionPlanById('plan-archived'),
    ).rejects.toThrow('Subscription plan not found');
    await expect(
      service.getPublicSubscriptionPlanById('plan-missing'),
    ).rejects.toThrow('Subscription plan not found');
  });

  it('creates a monthly plan with independent directional limits', async () => {
    const { service } = createService();

    await expect(
      service.createSubscriptionPlan({
        name: 'Pilot',
        description: 'Monthly pilot',
        monthlyPrice: 500000,
        maxAgents: 3,
        maxChannels: 1,
        messageLimit: 5000,
        inboundMessageLimit: 4000,
        outboundMessageLimit: 1000,
        allowedProviders: ['messenger'],
        storageLimitGb: 5,
      }),
    ).resolves.toMatchObject({
      name: 'Pilot',
      messageQuotaMode: 'combined',
      inboundMessageLimit: 4000,
      outboundMessageLimit: 1000,
    });
  });

  it('accepts a monthly plan without an aggregate message limit', async () => {
    const { service } = createService();

    await expect(
      service.createSubscriptionPlan({
        name: 'Monthly',
        monthlyPrice: 1000,
        maxAgents: 1,
        maxChannels: 1,
        inboundMessageLimit: 800,
        outboundMessageLimit: 200,
        storageLimitGb: 1,
      }),
    ).resolves.toMatchObject({
      name: 'Monthly',
      messageQuotaMode: 'combined',
      inboundMessageLimit: 800,
      outboundMessageLimit: 200,
    });
  });

  it('accepts explicit null limits as unlimited', async () => {
    const { service } = createService();

    await expect(
      service.createSubscriptionPlan({
        name: 'Enterprise',
        monthlyPrice: 0,
        maxAgents: 50,
        maxChannels: 10,
        messageLimit: null,
        inboundMessageLimit: null,
        outboundMessageLimit: null,
        storageLimitGb: 50,
      }),
    ).resolves.toMatchObject({ messageLimit: null });
  });

  it('rejects negative monthly limits and capacity on create', async () => {
    const { service } = createService();

    await expect(
      service.createSubscriptionPlan({
        name: 'Bad inbound',
        monthlyPrice: 1000,
        maxAgents: 1,
        maxChannels: 1,
        inboundMessageLimit: -5,
        storageLimitGb: 1,
      }),
    ).rejects.toThrow('Message limits must be null');

    await expect(
      service.createSubscriptionPlan({
        name: 'Bad channels',
        monthlyPrice: 1000,
        maxAgents: 1,
        maxChannels: -1,
        storageLimitGb: 1,
      }),
    ).rejects.toThrow('Channel, storage, and Agent capacities');
  });

  it('validates monthly limits against the merged state on plan update', async () => {
    const { service, repositories } = createService();
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-1',
      name: 'Growth',
      monthlyPrice: 50000,
      durationDays: 30,
      messageQuotaMode: 'combined',
      maxAgents: 5,
      maxChannels: 3,
      messageLimit: 10,
      inboundMessageLimit: null,
      outboundMessageLimit: null,
      storageLimitGb: 1,
      status: 'active',
    });

    await expect(
      service.updateSubscriptionPlan('plan-1', {
        outboundMessageLimit: -2,
      }),
    ).rejects.toThrow('Message limits must be null');

    await expect(
      service.updateSubscriptionPlan('plan-1', {
        inboundMessageLimit: 8,
        outboundMessageLimit: 4,
      }),
    ).resolves.toMatchObject({
      messageQuotaMode: 'combined',
      inboundMessageLimit: 8,
      outboundMessageLimit: 4,
    });
  });

  it('returns the required operational reason with suspend and reactivate results for auditing', async () => {
    const { service, repositories } = createService();

    await expect(
      service.suspendTenant('tenant-1', 'Overdue account review'),
    ).resolves.toMatchObject({
      status: 'suspended',
      statusReason: 'Overdue account review',
    });
    await expect(
      service.reactivateTenant('tenant-1', 'Payment confirmed'),
    ).resolves.toMatchObject({
      status: 'active',
      statusReason: 'Payment confirmed',
    });
    expect(repositories.tenant.save).toHaveBeenCalledTimes(2);
  });

  it('returns platform order visibility with tenant and customer context', async () => {
    const { service, repositories } = createService();
    const chain = {
      leftJoin: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: 'order-1',
          tenant_id: 'tenant-1',
          order_number: 'MM-ORD-1001',
          status: 'confirmed',
          payment_status: 'paid',
          payment_method: 'cod',
          total_amount: '25000',
          paid_amount: '25000',
          delivery_status: 'delivered',
          delivery_assignee_name: 'Aung',
          created_at: '2026-07-04T00:00:00.000Z',
          tenant_code: 'KME',
          company_name: 'KME Test',
          customer_id: 'customer-1',
          customer_name: 'Su Su',
          customer_phone: '091234',
        },
      ]),
    };
    repositories.order.createQueryBuilder.mockReturnValue(chain);

    await expect(
      service.getPlatformOrders(
        { page: 1, limit: 20 },
        { tenantId: 'tenant-1' },
      ),
    ).resolves.toMatchObject({
      total: 1,
      data: [
        expect.objectContaining({
          orderNumber: 'MM-ORD-1001',
          paymentStatus: 'paid',
          tenant: expect.objectContaining({ companyName: 'KME Test' }),
          customer: expect.objectContaining({ fullName: 'Su Su' }),
        }),
      ],
    });
    expect(chain.andWhere).toHaveBeenCalledWith('order.tenant_id = :tenantId', {
      tenantId: 'tenant-1',
    });
  });

  it('applies created-at date range filters to platform order visibility', async () => {
    const { service, repositories } = createService();
    const chain = {
      leftJoin: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    repositories.order.createQueryBuilder.mockReturnValue(chain);

    await service.getPlatformOrders(
      { page: 1, limit: 20 },
      {
        dateFrom: '2026-07-01T00:00:00.000Z',
        dateTo: '2026-07-31T23:59:59.999Z',
      },
    );

    expect(chain.andWhere).toHaveBeenCalledWith(
      'order.created_at >= :dateFrom',
      {
        dateFrom: '2026-07-01T00:00:00.000Z',
      },
    );
    expect(chain.andWhere).toHaveBeenCalledWith('order.created_at <= :dateTo', {
      dateTo: '2026-07-31T23:59:59.999Z',
    });
  });

  it('aggregates platform binary payment status totals', async () => {
    const { service, repositories } = createService();
    repositories.order.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          paymentStatus: 'paid',
          orderCount: '2',
          totalAmount: '50000',
          paidAmount: '50000',
        },
        {
          paymentStatus: 'unpaid',
          orderCount: '1',
          totalAmount: '20000',
          paidAmount: '0',
        },
      ]),
    });

    await expect(
      service.getPlatformOrderPaymentSummary(),
    ).resolves.toMatchObject({
      totals: {
        orderCount: 3,
        totalAmount: 70000,
        paidAmount: 50000,
      },
      statuses: {
        paid: expect.objectContaining({ orderCount: 2 }),
        unpaid: expect.objectContaining({
          orderCount: 1,
        }),
      },
    });
  });

  it('returns delivery visibility derived from merchant orders', async () => {
    const { service, repositories } = createService();
    const chain = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: 'order-2',
          tenant_id: 'tenant-1',
          order_number: 'MM-ORD-1002',
          status: 'confirmed',
          payment_status: 'unpaid',
          delivery_status: 'out_for_delivery',
          delivery_date: '2026-07-05',
          delivery_assignee_name: 'Zaw Zaw',
          delivery_assignee_phone: '09999888',
          created_at: '2026-07-04T00:00:00.000Z',
          tenant_code: 'KME',
          company_name: 'KME Test',
          customer_id: 'customer-1',
          customer_name: 'Su Su',
          customer_phone: '091234',
        },
      ]),
    };
    repositories.order.createQueryBuilder.mockReturnValue(chain);

    await expect(
      service.getPlatformDeliveries(
        { page: 1, limit: 20 },
        { status: 'out_for_delivery' },
      ),
    ).resolves.toMatchObject({
      total: 1,
      data: [
        expect.objectContaining({
          orderNumber: 'MM-ORD-1002',
          status: 'confirmed',
          paymentStatus: 'unpaid',
          deliveryStatus: 'out_for_delivery',
          tenant: expect.objectContaining({ companyName: 'KME Test' }),
          customer: expect.objectContaining({ fullName: 'Su Su' }),
        }),
      ],
    });
    expect(chain.where).toHaveBeenCalled();
    expect(chain.andWhere).toHaveBeenCalledWith(
      'order.delivery_status = :deliveryStatus',
      {
        deliveryStatus: 'out_for_delivery',
      },
    );
  });

  it('returns merchant channel visibility and support notes', async () => {
    const { service, repositories } = createService();
    (repositories.tenantChannel.find as jest.Mock).mockResolvedValue([
      {
        id: 'channel-1',
        tenantId: 'tenant-1',
        channelType: 'messenger',
        channelName: 'Primary Messenger',
        displayName: 'Messenger Main',
        status: 'active',
        credentialStatus: 'encrypted',
        connectionStatus: 'connected',
        connectedAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-02T00:00:00.000Z'),
      },
    ]);
    repositories.tenant.findOne
      .mockResolvedValueOnce({
        id: 'tenant-1',
        tenantCode: 'KME',
        companyName: 'KME Test',
        featureFlags: {
          platformSupportNote: {
            note: 'Needs onboarding follow-up',
            updatedAt: '2026-07-04T00:00:00.000Z',
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'tenant-1',
        tenantCode: 'KME',
        companyName: 'KME Test',
        featureFlags: {
          platformSupportNote: {
            note: 'Needs onboarding follow-up',
            updatedAt: '2026-07-04T00:00:00.000Z',
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'tenant-1',
        tenantCode: 'KME',
        companyName: 'KME Test',
        featureFlags: {
          platformSupportNote: {
            note: 'Escalate billing follow-up',
            updatedAt: '2026-07-05T00:00:00.000Z',
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'tenant-1',
        tenantCode: 'KME',
        companyName: 'KME Test',
        featureFlags: {
          platformSupportNote: {
            note: 'Escalate billing follow-up',
            updatedAt: '2026-07-05T00:00:00.000Z',
          },
        },
      });

    await expect(service.getTenantChannels('tenant-1')).resolves.toEqual([
      expect.objectContaining({
        channelType: 'messenger',
        connectionStatus: 'connected',
      }),
    ]);
    await expect(service.getTenantSupportNote('tenant-1')).resolves.toEqual({
      note: 'Needs onboarding follow-up',
      updatedAt: '2026-07-04T00:00:00.000Z',
    });
    await expect(
      service.updateTenantSupportNote('tenant-1', 'Escalate billing follow-up'),
    ).resolves.toMatchObject({
      note: 'Escalate billing follow-up',
    });
    expect(repositories.tenant.save).toHaveBeenCalledWith(
      expect.objectContaining({
        featureFlags: expect.objectContaining({
          platformSupportNote: expect.objectContaining({
            note: 'Escalate billing follow-up',
          }),
        }),
      }),
    );
  });

  it('returns platform-wide channel visibility with tenant context', async () => {
    const { service, repositories } = createService();
    (repositories.tenantChannel.find as jest.Mock).mockResolvedValue([
      {
        id: 'channel-1',
        tenantId: 'tenant-1',
        channelType: 'messenger',
        channelName: 'Primary Messenger',
        displayName: 'Messenger Main',
        status: 'active',
        credentialStatus: 'encrypted',
        connectionStatus: 'connected',
        connectedAt: new Date('2026-07-01T00:00:00.000Z'),
        lastSyncAt: new Date('2026-07-04T00:00:00.000Z'),
        errorMessage: null,
        updatedAt: new Date('2026-07-05T00:00:00.000Z'),
        tenant: {
          id: 'tenant-1',
          tenantCode: 'KME',
          companyName: 'KME Test',
          status: 'active',
        },
      },
    ]);

    await expect(service.getPlatformChannels()).resolves.toEqual([
      expect.objectContaining({
        id: 'channel-1',
        channelType: 'messenger',
        connectionStatus: 'connected',
        tenant: expect.objectContaining({
          id: 'tenant-1',
          companyName: 'KME Test',
        }),
      }),
    ]);
  });

  it('returns effective platform tenant rate limits with persisted and default sources', async () => {
    const { service, repositories } = createService();
    (repositories.tenant.find as jest.Mock).mockResolvedValue([
      {
        id: 'tenant-1',
        tenantCode: 'KME',
        companyName: 'KME Test',
        status: 'active',
      },
      {
        id: 'tenant-2',
        tenantCode: 'NOVA',
        companyName: 'Nova Mart',
        status: 'pending',
      },
    ]);
    (repositories.tenantRateLimit.find as jest.Mock).mockResolvedValue([
      {
        id: 'limit-1',
        tenantId: 'tenant-1',
        messagesPerMinute: 120,
        apiRequestsPerMinute: 240,
        webhookEventsPerMinute: 60,
        throttlingMode: 'hard_limit',
        graceLimitPercentage: 10,
        updatedAt: new Date('2026-07-05T00:00:00.000Z'),
      },
    ]);

    await expect(service.getPlatformRateLimits()).resolves.toEqual([
      expect.objectContaining({
        id: 'limit-1',
        tenantId: 'tenant-1',
        source: 'persisted',
        messagesPerMinute: 120,
        throttlingMode: 'hard_limit',
      }),
      expect.objectContaining({
        id: null,
        tenantId: 'tenant-2',
        source: 'default',
        messagesPerMinute: 60,
        apiRequestsPerMinute: 100,
        webhookEventsPerMinute: 50,
        throttlingMode: 'soft_warning',
        graceLimitPercentage: 20,
      }),
    ]);
  });

  it('returns platform conversation visibility', async () => {
    const { service, repositories } = createService();
    const chain = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: 'conversation-1',
          tenant_id: 'tenant-1',
          status: 'open',
          priority: 'high',
          subject: 'Delayed order follow-up',
          last_message_at: '2026-07-04T00:00:00.000Z',
          last_customer_message_at: '2026-07-04T00:00:00.000Z',
          last_agent_response_at: null,
          assigned_at: '2026-07-04T00:00:00.000Z',
          created_at: '2026-07-03T00:00:00.000Z',
          tenant_code: 'KME',
          company_name: 'KME Test',
          customer_id: 'customer-1',
          customer_name: 'Su Su',
          customer_phone: '091234',
          customer_notes: 'VIP customer',
          channel_id: 'channel-1',
          channel_type: 'messenger',
          channel_name: 'Primary Messenger',
          channel_display_name: 'Messenger Main',
          agent_id: 'agent-1',
          agent_name: 'Aung Aung',
          last_message_preview: 'Where is my order?',
          message_count: '3',
        },
      ]),
    };
    repositories.conversation.createQueryBuilder.mockReturnValue(chain);

    await expect(
      service.getPlatformConversations(
        { page: 1, limit: 20 },
        { tenantId: 'tenant-1', status: 'open' },
      ),
    ).resolves.toMatchObject({
      total: 1,
      data: [
        expect.objectContaining({
          status: 'open',
          lastMessagePreview: 'Where is my order?',
          tenant: expect.objectContaining({ companyName: 'KME Test' }),
          channel: expect.objectContaining({ channelType: 'messenger' }),
        }),
      ],
    });
  });

  it('returns merchant product summaries and live product visibility', async () => {
    const { service, repositories } = createService();
    const productChain = {
      leftJoin: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      clone: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: 'product-1',
          tenant_id: 'tenant-1',
          name: 'Instant Noodle Pack',
          sku: 'SKU-1',
          status: 'active',
          price: '2500',
          stock_quantity: '3',
          low_stock_threshold: '5',
          track_inventory: true,
          updated_at: '2026-07-04T00:00:00.000Z',
          tenant_code: 'KME',
          company_name: 'KME Test',
        },
      ]),
    };
    const summaryChain = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          tenantId: 'tenant-1',
          tenantCode: 'KME',
          companyName: 'KME Test',
          productCount: '4',
          activeProducts: '3',
          inactiveProducts: '1',
          outOfStockProducts: '0',
          lowStockProducts: '1',
          lastUpdatedAt: '2026-07-04T00:00:00.000Z',
        },
      ]),
    };
    repositories.product.createQueryBuilder
      .mockReturnValueOnce(productChain)
      .mockReturnValueOnce(summaryChain);

    await expect(
      service.getPlatformProducts({ page: 1, limit: 20 }, { status: 'active' }),
    ).resolves.toMatchObject({
      total: 1,
      data: [
        expect.objectContaining({
          name: 'Instant Noodle Pack',
          status: 'active',
          isLowStock: true,
          tenant: expect.objectContaining({ companyName: 'KME Test' }),
        }),
      ],
    });
    await expect(
      service.getPlatformProductCatalogSummary('KME'),
    ).resolves.toEqual([
      expect.objectContaining({
        companyName: 'KME Test',
        productCount: 4,
        activeProducts: 3,
        lowStockProducts: 1,
      }),
    ]);
  });

  // ─── Phase 2: selected-plan payment → period snapshot ───

  it('activates entitlement for a billing record with a different selected plan', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-11T09:00:00.000Z'));
    const {
      service,
      repositories,
      entitlementService,
      subscriptionPeriodService,
    } = createService();
    repositories.subscriptionPlan.findOne.mockImplementation(
      async (options: any) => {
        const planId = options?.where?.id ?? options?.id ?? 'plan-1';
        return {
          id: planId,
          name: planId === 'plan-growth' ? 'Growth' : 'Growth',
          monthlyPrice: 75000,
          maxAgents: 5,
          maxChannels: 3,
          messageLimit: 10,
          autoApprove: false,
        };
      },
    );
    repositories.tenantBillingRecord.findOne
      .mockResolvedValueOnce({
        id: 'billing-growth',
        tenantId: 'tenant-1',
        subscriptionPlanId: 'plan-growth',
        invoiceNumber: 'INV-2026-GROWTH',
        billingPeriodStart: new Date('2026-08-01'),
        billingPeriodEnd: new Date('2026-09-01'),
        reviewStatus: 'in_review',
        amountDue: 75000,
        amountPaid: 0,
        currency: 'MMK',
        metadata: {
          purchaseRequestType: 'subscription_period',
          selectedPlanId: 'plan-growth',
          selectedPlanName: 'Growth',
          paymentProof: {
            id: 'proof-growth',
            status: 'pending_review',
            paidAmount: 75000,
            paidDate: '2026-08-11T00:00:00.000Z',
          },
          paymentProofSubmissions: [
            { id: 'proof-growth', status: 'pending_review' },
          ],
        },
      })
      .mockResolvedValueOnce({
        id: 'billing-growth',
        tenantId: 'tenant-1',
        subscriptionPlanId: 'plan-growth',
        billingPeriodStart: new Date('2026-08-01'),
        billingPeriodEnd: new Date('2026-09-01'),
        reviewStatus: 'confirm',
        amountDue: 75000,
        amountPaid: 75000,
        currency: 'MMK',
        metadata: {
          paymentProof: { id: 'proof-growth', status: 'confirmed' },
        },
      });

    await service.reviewTenantPaymentProof(
      'tenant-1',
      'billing-growth',
      'operator-1',
      { outcome: 'confirmed' },
    );

    // Payment confirmation creates the pending period for the billing
    // record's selected plan, not the tenant's assigned plan, and does not
    // project operational entitlement yet.
    expect(entitlementService.activatePaidPeriod).not.toHaveBeenCalled();
    const periodInput = (
      subscriptionPeriodService.ensurePaidBillingPeriod as jest.Mock
    ).mock.calls[0][0];
    expect(periodInput).toMatchObject({
      tenantId: 'tenant-1',
      plan: expect.objectContaining({ id: 'plan-growth' }),
      paymentStatus: 'paid',
      adminActivationStatus: 'pending',
    });

    // The separate admin activation step activates the entitlement for the
    // selected plan.
    await service.adminActivatePeriod(
      'tenant-1',
      'period-1',
      'operator-1',
      undefined,
    );
    expect(entitlementService.activatePaidPeriod).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        planId: 'plan-growth',
      }),
    );
    jest.useRealTimers();
  });

  it('does not activate entitlement when payment proof is rejected', async () => {
    const { service, repositories, entitlementService } = createService();
    repositories.tenantBillingRecord.findOne.mockResolvedValue({
      id: 'billing-1',
      tenantId: 'tenant-1',
      subscriptionPlanId: 'plan-1',
      billingPeriodStart: new Date('2026-08-01'),
      billingPeriodEnd: new Date('2026-09-01'),
      invoiceStatus: 'issued',
      paymentStatus: 'unpaid',
      amountDue: 50000,
      amountPaid: 0,
      currency: 'MMK',
      metadata: {
        paymentProof: { id: 'proof-1', status: 'pending_review' },
        paymentProofSubmissions: [{ id: 'proof-1', status: 'pending_review' }],
      },
    });

    await service.reviewTenantPaymentProof('tenant-1', 'billing-1', 'op-1', {
      outcome: 'rejected',
      safeReason: 'Unreadable receipt',
    });

    expect(entitlementService.activatePaidPeriod).not.toHaveBeenCalled();
  });
});

describe('PlatformAdminService merchant onboarding trial provisioning (Plan 14 Phase 2)', () => {
  it('provisions one auto-approved trial when startWithTrial is true (task 2.6)', async () => {
    const { service, repositories, subscriptionPeriodService } =
      createService();
    repositories.tenant.findOne.mockResolvedValue(null);

    await service.createTenant({
      tenantCode: 'YHS',
      companyName: 'YHS Co',
      contactEmail: 'owner@yhs.local',
      startWithTrial: true,
    });

    expect(subscriptionPeriodService.resolveActiveTrialPlan).toHaveBeenCalled();
    expect(
      subscriptionPeriodService.ensureTrialPeriodForTenant,
    ).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'platform_admin' }),
      expect.objectContaining({ now: expect.any(Date) }),
    );
  });

  it('creates no trial state when startWithTrial is absent or false (task 2.6)', async () => {
    const { service, repositories, subscriptionPeriodService } =
      createService();
    repositories.tenant.findOne.mockResolvedValue(null);

    await service.createTenant({
      tenantCode: 'YHS',
      companyName: 'YHS Co',
      contactEmail: 'owner@yhs.local',
    });

    expect(
      subscriptionPeriodService.resolveActiveTrialPlan,
    ).not.toHaveBeenCalled();
    expect(
      subscriptionPeriodService.ensureTrialPeriodForTenant,
    ).not.toHaveBeenCalled();
  });
});

describe('PlatformAdminService invoice cancel (Plan 56 bugfix)', () => {
  function cancelSetup(options: {
    reviewStatus: string;
    proofStatus?: string;
    periodStatus?: string;
    revisionStatus?: string;
  }) {
    const { service, repositories } = createService();
    const record = {
      id: 'billing-1',
      tenantId: 'tenant-1',
      reviewStatus: options.reviewStatus,
      metadata:
        options.proofStatus != null
          ? { paymentProof: { status: options.proofStatus } }
          : {},
    };
    const revision =
      options.revisionStatus != null
        ? {
            id: 'revision-1',
            tenantId: 'tenant-1',
            subscriptionPeriodId: 'period-1',
            billingRecordId: 'billing-1',
            upgradeStatus: options.revisionStatus,
          }
        : null;
    // The shared manager mock routes every entity to the billing-record
    // repository mock: first findOne is the record, second is the revision.
    repositories.tenantBillingRecord.findOne
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(revision);
    repositories.subscriptionPeriod.findOne.mockResolvedValue(
      options.periodStatus != null
        ? { id: 'period-1', periodStatus: options.periodStatus }
        : null,
    );
    return { service, record };
  }

  it('rejects an open invoice, kills the linked revision, stamps a pending proof', async () => {
    const { service, record } = cancelSetup({
      reviewStatus: 'in_review',
      proofStatus: 'pending_review',
      revisionStatus: 'pending_approval',
    });

    const saved = await service.cancelBillingRecord(
      'billing-1',
      'admin-1',
      'duplicate request',
    );

    expect(saved.reviewStatus).toBe('reject');
    expect(saved.metadata.cancelReason).toBe('duplicate request');
    expect(saved.metadata.paymentProof.status).toBe('cancelled');
  });

  it('refuses to cancel an invoice driving a live period', async () => {
    const { service } = cancelSetup({
      reviewStatus: 'in_review',
      periodStatus: 'active',
    });

    await expect(
      service.cancelBillingRecord('billing-1', 'admin-1', 'oops'),
    ).rejects.toThrow('already has a subscription period');
  });

  it('refuses to cancel a tenant-cancelled invoice', async () => {
    const { service } = cancelSetup({ reviewStatus: 'cancelled' });

    await expect(
      service.cancelBillingRecord('billing-1', 'admin-1', 'oops'),
    ).rejects.toThrow('already cancelled by the tenant');
  });
});
