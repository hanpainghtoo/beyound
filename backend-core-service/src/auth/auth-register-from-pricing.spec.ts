/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { AuthService } from './auth.service';
import {
  yangonCalendarDate,
  yangonMonthStart,
  yangonNextMonthStart,
} from '../subscription-period/yangon-month.util';

const businessPlan = {
  id: 'plan-business-1',
  name: 'Growth',
  planType: 'business',
  status: 'active',
  monthlyPrice: 50000,
  requestable: true,
  features: {},
};

const contactOnlyPlan = {
  ...businessPlan,
  id: 'plan-contact-1',
  name: 'Enterprise',
  features: { public: { availability: 'contact-only' } },
};

const trialPlanRow = {
  ...businessPlan,
  id: 'plan-trial',
  name: 'Guided Pilot (Trial)',
  planType: 'trial',
};

function baseDto(overrides: Record<string, any> = {}) {
  return {
    subscriptionPlanId: 'plan-business-1',
    companyName: 'Zan Boutique',
    companyEmail: 'owner@zan.example',
    businessType: 'retail',
    teamSize: '1-3',
    fullName: 'Thiri Zan',
    personalEmail: 'thiri@zan.example',
    password: 'ZayStrong123!',
    paymentMethodOptionId: 'pay-opt-1',
    note: 'Need invoice',
    acceptTerms: true,
    ...overrides,
  };
}

function createPricingService(
  planRow: any,
  extra: { mediaLibraryService?: any } = {},
) {
  const tenantRepo = {
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ id: 'tenant-1', ...v })),
    findOne: jest.fn(async () => null),
  };
  const tenantUserRepo = {
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ id: 'user-1', ...v })),
    findOne: jest.fn(async () => null),
  };
  const planRepo = {
    findOne: jest.fn(async ({ where }: any) =>
      where?.id === planRow?.id ? planRow : null,
    ),
  };
  const billingRepo = {
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ id: 'billing-1', ...v })),
  };
  const manager: any = {
    getRepository: (entity: any) => {
      if (entity?.name === 'Tenant') return tenantRepo;
      if (entity?.name === 'TenantUser') return tenantUserRepo;
      if (entity?.name === 'SubscriptionPlan') return planRepo;
      if (entity?.name === 'TenantBillingRecord') return billingRepo;
      return {
        create: (v: any) => v,
        save: async (v: any) => v,
        findOne: jest.fn(async () => null),
      };
    },
    query: jest.fn(async () => [{ n: 7 }]),
  };
  const outerTenantRepo: any = {
    findOne: jest.fn(async () => null),
    manager: { transaction: jest.fn(async (cb: any) => cb(manager)) },
  };
  const otpGenerate = jest.fn(async () => ({
    message: 'If an account exists, a verification code has been sent.',
    expiresAt: '2026-09-24T00:02:00.000Z',
    resendAvailableAt: '2026-09-24T00:01:00.000Z',
    expiresInSeconds: 120,
  }));
  const sendInvoiceIssued = jest.fn(async () => true);
  const createRegistrationPeriod = jest.fn(async () => ({ id: 'period-1' }));
  const service = new AuthService(
    { findOne: jest.fn() } as any,
    tenantUserRepo as any,
    outerTenantRepo,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { sign: jest.fn(() => 'token') } as any,
    { get: jest.fn(() => 4) } as any,
    {} as any,
    { sendInvoiceIssued } as any,
    { resolveActiveTrialPlan: jest.fn(), createRegistrationPeriod } as any,
    { generate: otpGenerate } as any,
    extra.mediaLibraryService,
  );
  return {
    service,
    tenantRepo,
    tenantUserRepo,
    planRepo,
    billingRepo,
    manager,
    otpGenerate,
    sendInvoiceIssued,
    createRegistrationPeriod,
  };
}

describe('AuthService.registerFromPricing (Plan 44)', () => {
  it('creates a billing record for the requested business plan with a sequential invoice number', async () => {
    const { service, billingRepo } = createPricingService(businessPlan);
    const res = await service.registerFromPricing(baseDto());
    expect(res.success).toBe(true);
    expect(res.invoiceNo).toBe('INV-00007');
    expect(billingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        subscriptionPlanId: 'plan-business-1',
        invoiceNo: 'INV-00007',
        reviewStatus: 'in_review',
        requestedBy: 'user-1',
        amountDue: 50000,
      }),
    );
    const saved = billingRepo.save.mock.calls[0][0];
    expect(saved.issueDate).toBeInstanceOf(Date);
    expect(saved.metadata).toMatchObject({
      source: 'pricing_registration',
      paymentMethodOptionId: 'pay-opt-1',
      purchaseRequestType: 'subscription_period',
      requestedStartOption: 'current_month',
      startOption: 'current_month',
    });
  });

  it('bills the current Yangon calendar month so admin confirm accepts it', async () => {
    const { service, billingRepo, createRegistrationPeriod } =
      createPricingService(businessPlan);
    await service.registerFromPricing(baseDto());
    const saved = billingRepo.save.mock.calls[0][0];
    const monthStart = yangonMonthStart(new Date());
    const monthEnd = yangonNextMonthStart(new Date());
    expect(new Date(saved.billingPeriodStart).toISOString()).toBe(
      yangonCalendarDate(monthStart).toISOString(),
    );
    expect(new Date(saved.billingPeriodEnd).toISOString()).toBe(
      yangonCalendarDate(monthEnd).toISOString(),
    );
    expect(createRegistrationPeriod).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        monthStartAt: monthStart,
        monthEndAt: monthEnd,
      }),
    );
  });

  it('mints an email_verification OTP for the shared verify-email page', async () => {
    const { service, otpGenerate } = createPricingService(businessPlan);
    const res = await service.registerFromPricing(baseDto());
    expect(otpGenerate).toHaveBeenCalledWith(
      'thiri@zan.example',
      'email_verification',
      expect.objectContaining({ paymentId: expect.any(String) }),
    );
    expect(res.emailVerificationExpiresAt).toBe('2026-09-24T00:02:00.000Z');
    expect(res.resendAvailableAt).toBe('2026-09-24T00:01:00.000Z');
  });

  it('allows contact-only plans to be requested', async () => {
    const { service, billingRepo } = createPricingService(contactOnlyPlan);
    const res = await service.registerFromPricing(
      baseDto({ subscriptionPlanId: 'plan-contact-1' }),
    );
    expect(res.success).toBe(true);
    expect(billingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionPlanId: 'plan-contact-1' }),
    );
  });

  it('rejects trial plans with 400', async () => {
    const { service, billingRepo } = createPricingService(trialPlanRow);
    await expect(
      service.registerFromPricing(
        baseDto({ subscriptionPlanId: 'plan-trial' }),
      ),
    ).rejects.toThrow('not available for pricing registration');
    expect(billingRepo.save).not.toHaveBeenCalled();
  });

  it('rejects unknown plans with 404', async () => {
    const { service, billingRepo } = createPricingService(businessPlan);
    await expect(
      service.registerFromPricing(
        baseDto({ subscriptionPlanId: '00000000-0000-4000-a000-000000000000' }),
      ),
    ).rejects.toThrow('not found or is not active');
    expect(billingRepo.save).not.toHaveBeenCalled();
  });

  it('creates the owner with the personal email and activates the tenant', async () => {
    const { service, tenantRepo, tenantUserRepo } =
      createPricingService(businessPlan);
    await service.registerFromPricing(baseDto());
    expect(tenantUserRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'thiri@zan.example',
        normalizedEmail: 'thiri@zan.example',
        role: 'owner',
      }),
    );
    expect(tenantRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        contactEmail: 'owner@zan.example',
      }),
    );
    const savedTenant = tenantRepo.save.mock.calls[0][0];
    expect(savedTenant.approvedAt).toBeInstanceOf(Date);
  });

  it('rejects a duplicate personal email with 409', async () => {
    const { service, tenantUserRepo } = createPricingService(businessPlan);
    (tenantUserRepo.findOne as jest.Mock).mockResolvedValueOnce({
      id: 'existing-user',
    });
    await expect(service.registerFromPricing(baseDto())).rejects.toThrow(
      'already exists for this email',
    );
    expect(tenantUserRepo.findOne).toHaveBeenCalledWith({
      where: { normalizedEmail: 'thiri@zan.example' },
    });
  });

  it('creates an unpaid registration period linked to the invoice', async () => {
    const { service, createRegistrationPeriod } =
      createPricingService(businessPlan);
    await service.registerFromPricing(baseDto());
    expect(createRegistrationPeriod).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        billingRecordId: 'billing-1',
        startOption: 'current_month',
      }),
    );
  });

  it('sends the invoice email to the company email', async () => {
    const { service, sendInvoiceIssued } = createPricingService(businessPlan);
    await service.registerFromPricing(baseDto());
    expect(sendInvoiceIssued).toHaveBeenCalledWith(
      'owner@zan.example',
      expect.objectContaining({
        invoiceNo: 'INV-00007',
        planName: 'Growth',
      }),
    );
  });

  it('still registers when invoice email delivery fails', async () => {
    const { service, sendInvoiceIssued } = createPricingService(businessPlan);
    sendInvoiceIssued.mockRejectedValueOnce(new Error('SMTP down'));
    const res = await service.registerFromPricing(baseDto());
    expect(res.success).toBe(true);
  });

  it('attaches a pre-uploaded registration proof to the billing record', async () => {
    const getPlatformBillingProofFile = jest.fn(async () => ({
      id: 'file-proof-1',
    }));
    const { service, billingRepo } = createPricingService(businessPlan, {
      mediaLibraryService: { getPlatformBillingProofFile },
    });
    await service.registerFromPricing(
      baseDto({ paymentProofFileId: 'file-proof-1' }),
    );
    expect(getPlatformBillingProofFile).toHaveBeenCalledWith('file-proof-1');
    const calls = billingRepo.save.mock.calls;
    const saved = calls[calls.length - 1][0];
    expect(saved.paymentProofFileId).toBe('file-proof-1');
    expect(saved.metadata.paymentProof).toMatchObject({
      mediaFileId: 'file-proof-1',
      status: 'pending_review',
      reviewStatus: 'pending_review',
    });
    // Mirrors the workspace billing module (tenant.service.submitPaymentProof):
    // the platform "Review proof" confirm path reads `proof.paidAmount`, so a
    // missing amount would be coerced to 0 and fail the
    // `amountPaid === amountDue` guard on confirm.
    expect(Number(saved.metadata.paymentProof.paidAmount)).toBe(
      Number(saved.amountDue),
    );
    expect(saved.metadata.paymentProof.paidDate).toEqual(expect.any(String));
    expect(saved.metadata.paymentProofSubmissions).toEqual([
      expect.objectContaining({
        id: saved.metadata.paymentProof.id,
        status: 'pending_review',
        paidAmount: Number(saved.amountDue),
      }),
    ]);
  });

  it('rejects an unknown registration proof file', async () => {
    const { service, billingRepo } = createPricingService(businessPlan, {
      mediaLibraryService: {
        getPlatformBillingProofFile: jest.fn(async () => {
          throw new Error('Billing payment-proof file not found');
        }),
      },
    });
    await expect(
      service.registerFromPricing(
        baseDto({ paymentProofFileId: 'file-missing' }),
      ),
    ).rejects.toThrow('Billing payment-proof file not found');
    expect(billingRepo.save).not.toHaveBeenCalled();
  });
});
