import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { TenantService } from './tenant.service';
import { Tenant } from './entities/tenant.entity';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import { TenantSubscriptionPeriod } from '../subscription-period/entities/tenant-subscription-period.entity';
import { TenantSubscriptionPeriodUpgradeRevision } from '../subscription-period/entities/tenant-subscription-period-upgrade-revision.entity';
import { SubscriptionPeriodEvent } from '../subscription-period/entities/subscription-period-event.entity';
import {
  yangonCalendarDate,
  yangonMonthEnd,
  yangonMonthStart,
} from '../subscription-period/yangon-month.util';

function createService(
  options: {
    billingManager?: any;
    mediaLibraryService?: any;
    emailService?: any;
  } = {},
) {
  const repositories = {
    tenantUser: { count: jest.fn(), find: jest.fn(), findOne: jest.fn() },
    tenantChannel: { count: jest.fn(), find: jest.fn() },
    cannedResponse: {},
    product: {},
    productCategory: {},
    tenantAnalytics: { find: jest.fn() },
    conversation: { count: jest.fn(), createQueryBuilder: jest.fn() },
    tenant: { findOne: jest.fn() },
    subscriptionPlan: { findOne: jest.fn() },
    tenantBillingRecord: {
      manager: options.billingManager,
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
    },
    tenantUsage: {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '0', latest: null }),
      })),
    },
    lead: {
      find: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        id: 'lead-1',
        status: 'new',
        ...value,
      })),
    },
    subscriptionPeriod: {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    },
    subscriptionPeriodUpgradeRevision: {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    },
  };

  const mediaLibraryService = options.mediaLibraryService || {
    getBillingProofFile: jest.fn().mockResolvedValue({
      id: 'file-1',
      status: 'registered',
      purpose: 'billing-payment-proof',
      uploadedAt: '2026-07-10T00:00:00.000Z',
    }),
  };

  const service = new TenantService(
    repositories.tenantUser as any,
    repositories.tenantChannel as any,
    repositories.cannedResponse as any,
    repositories.product as any,
    repositories.productCategory as any,
    repositories.tenantAnalytics as any,
    repositories.conversation as any,
    repositories.tenant as any,
    repositories.subscriptionPlan as any,
    repositories.tenantBillingRecord as any,
    repositories.lead as any,
    repositories.tenantUsage as any,
    repositories.subscriptionPeriod as any,
    repositories.subscriptionPeriodUpgradeRevision as any,
    {} as any,
    {} as any,
    {} as any,
    { getTenantEntitlement: jest.fn().mockResolvedValue(null) } as any,
    mediaLibraryService,
    options.emailService,
  );

  return { service, repositories, mediaLibraryService };
}

describe('TenantService plan change requests', () => {
  it('creates a current-month purchase request at the full plan price', async () => {
    const query = (result: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(result),
      getMany: jest.fn().mockResolvedValue(result),
    });
    const tenant = {
      id: 'tenant-1',
      subscriptionPlanId: 'plan-1',
    };
    const plan = { id: 'plan-1', status: 'active', monthlyPrice: 30000 };
    const savedRecord = {
      id: '12345678-1234-4234-8234-123456789abc',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      invoiceNumber: null,
    };
    const managerRepositories = new Map<any, any>([
      [Tenant, { createQueryBuilder: jest.fn(() => query(tenant)) }],
      [SubscriptionPlan, { findOne: jest.fn().mockResolvedValue(plan) }],
      [
        TenantSubscriptionPeriod,
        {
          createQueryBuilder: jest.fn(() => query([])),
        },
      ],
      [
        TenantBillingRecord,
        {
          createQueryBuilder: jest.fn(() => query([])),
          create: jest.fn((value) => value),
          save: jest.fn().mockResolvedValue(savedRecord),
        },
      ],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager });

    const result = await service.createSubscriptionPurchaseRequest('tenant-1', {
      idempotencyKey: 'purchase-1',
      startOption: 'current_month',
    });

    const invoiceDatePart = yangonCalendarDate(new Date())
      .toISOString()
      .slice(0, 10)
      .replaceAll('-', '');
    expect(result.billingRecord).toMatchObject({
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
    });
    expect(
      managerRepositories.get(TenantBillingRecord).save,
    ).toHaveBeenCalledTimes(1);
    expect(result.purchase).toMatchObject({
      amountDue: 30000,
      reviewStatus: 'in_review',
      periodStatus: 'pending_activation',
    });
    expect(
      managerRepositories.get(TenantBillingRecord).create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceNo: expect.any(String),
        amountDue: 30000,
        reviewStatus: 'in_review',
        issueDate: yangonCalendarDate(new Date()),
        metadata: expect.objectContaining({
          idempotencyKey: 'purchase-1',
          startOption: 'current_month',
          proration: false,
          selectedPlanId: 'plan-1',
          selectedPlanName: undefined,
        }),
      }),
    );
  });

  it('persists request-payment selections to record metadata (Plan 30)', async () => {
    const query = (result: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(result),
      getMany: jest.fn().mockResolvedValue(result),
    });
    const tenant = {
      id: 'tenant-1',
      subscriptionPlanId: 'plan-1',
    };
    const plan = { id: 'plan-1', status: 'active', monthlyPrice: 30000 };
    const savedRecord = {
      id: '12345678-1234-4234-8234-123456789abc',
      reviewStatus: 'in_review',
    };
    const managerRepositories = new Map<any, any>([
      [Tenant, { createQueryBuilder: jest.fn(() => query(tenant)) }],
      [SubscriptionPlan, { findOne: jest.fn().mockResolvedValue(plan) }],
      [
        TenantSubscriptionPeriod,
        {
          createQueryBuilder: jest.fn(() => query([])),
        },
      ],
      [
        TenantBillingRecord,
        {
          createQueryBuilder: jest.fn(() => query([])),
          create: jest.fn((value) => value),
          save: jest.fn().mockResolvedValue(savedRecord),
        },
      ],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager });

    await service.createSubscriptionPurchaseRequest('tenant-1', {
      idempotencyKey: 'purchase-30',
      startOption: 'current_month',
      subscriptionPlanId: 'plan-1',
      paymentMethod: 'kbzpay',
      paymentAccount: 'KBZPay 09-XXX-XXX',
      note: 'Paid from company wallet',
      requestedBy: '11111111-1111-4111-8111-111111111111',
    });

    expect(
      managerRepositories.get(TenantBillingRecord).create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedBy: '11111111-1111-4111-8111-111111111111',
        metadata: expect.objectContaining({
          selectedPaymentMethod: 'kbzpay',
          selectedPaymentAccount: 'KBZPay 09-XXX-XXX',
          requestNote: 'Paid from company wallet',
        }),
      }),
    );
  });

  it('emails the invoice to the company email without blocking creation (Plan 30)', async () => {
    const emailService = {
      sendInvoiceIssued: jest.fn().mockResolvedValue(true),
    };
    const query = (result: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(result),
      getMany: jest.fn().mockResolvedValue(result),
    });
    const tenant = {
      id: 'tenant-1',
      companyName: 'Acme Co',
      contactEmail: 'billing@acme.test',
      subscriptionPlanId: 'plan-1',
    };
    const plan = {
      id: 'plan-1',
      name: 'Business Launch',
      status: 'active',
      monthlyPrice: 30000,
    };
    const savedRecord = {
      id: '12345678-1234-4234-8234-123456789abc',
      invoiceNo: 'INV-00099',
      amountDue: 30000,
      reviewStatus: 'in_review',
    };
    const managerRepositories = new Map<any, any>([
      [Tenant, { createQueryBuilder: jest.fn(() => query(tenant)) }],
      [SubscriptionPlan, { findOne: jest.fn().mockResolvedValue(plan) }],
      [
        TenantSubscriptionPeriod,
        {
          createQueryBuilder: jest.fn(() => query([])),
        },
      ],
      [
        TenantBillingRecord,
        {
          createQueryBuilder: jest.fn(() => query([])),
          create: jest.fn((value) => value),
          save: jest.fn().mockResolvedValue(savedRecord),
        },
      ],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager, emailService });

    const result = await service.createSubscriptionPurchaseRequest('tenant-1', {
      idempotencyKey: 'purchase-email',
      startOption: 'current_month',
      subscriptionPlanId: 'plan-1',
    });

    expect(result.billingRecord).toMatchObject({ id: savedRecord.id });
    expect(emailService.sendInvoiceIssued).toHaveBeenCalledWith(
      'billing@acme.test',
      expect.objectContaining({
        companyName: 'Acme Co',
        invoiceNo: 'INV-00099',
        planName: 'Business Launch',
      }),
    );
  });

  it('still creates the invoice when email delivery fails (Plan 30)', async () => {
    const emailService = {
      sendInvoiceIssued: jest.fn().mockRejectedValue(new Error('SMTP down')),
    };
    const query = (result: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(result),
      getMany: jest.fn().mockResolvedValue(result),
    });
    const tenant = {
      id: 'tenant-1',
      companyName: 'Acme Co',
      contactEmail: 'billing@acme.test',
      subscriptionPlanId: 'plan-1',
    };
    const plan = {
      id: 'plan-1',
      name: 'Business Launch',
      status: 'active',
      monthlyPrice: 30000,
    };
    const savedRecord = {
      id: '12345678-1234-4234-8234-123456789abc',
      invoiceNo: 'INV-00100',
      amountDue: 30000,
      reviewStatus: 'in_review',
    };
    const managerRepositories = new Map<any, any>([
      [Tenant, { createQueryBuilder: jest.fn(() => query(tenant)) }],
      [SubscriptionPlan, { findOne: jest.fn().mockResolvedValue(plan) }],
      [
        TenantSubscriptionPeriod,
        {
          createQueryBuilder: jest.fn(() => query([])),
        },
      ],
      [
        TenantBillingRecord,
        {
          createQueryBuilder: jest.fn(() => query([])),
          create: jest.fn((value) => value),
          save: jest.fn().mockResolvedValue(savedRecord),
        },
      ],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager, emailService });

    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'purchase-email-fail',
        startOption: 'current_month',
        subscriptionPlanId: 'plan-1',
      }),
    ).resolves.toMatchObject({ billingRecord: { id: savedRecord.id } });
  });

  it('rejects self-serve purchase of contact-only plans', async () => {
    const query = (result: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(result),
      getMany: jest.fn().mockResolvedValue([]),
    });
    const tenant = { id: 'tenant-1', subscriptionPlanId: 'plan-1' };
    const contactPlan = {
      id: 'plan-contact',
      status: 'active',
      monthlyPrice: 0,
      features: { public: { availability: 'contact-only' } },
    };
    const managerRepositories = new Map<any, any>([
      [Tenant, { createQueryBuilder: jest.fn(() => query(tenant)) }],
      [SubscriptionPlan, { findOne: jest.fn().mockResolvedValue(contactPlan) }],
      [
        TenantBillingRecord,
        {
          createQueryBuilder: jest.fn(() => query([])),
          create: jest.fn((value) => value),
          save: jest.fn(),
        },
      ],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager });

    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'purchase-contact',
        startOption: 'current_month',
        subscriptionPlanId: 'plan-contact',
      }),
    ).rejects.toThrow('requires contacting sales');
    expect(
      managerRepositories.get(TenantBillingRecord).save,
    ).not.toHaveBeenCalled();
  });

  it('rejects a next-month request when the tenant has no active paid current period (7.37c)', async () => {
    // A tenant with no paid period and no paid current-month reservation
    // (trial-only or brand new) must first purchase/upgrade the current
    // month before requesting a future month.
    const query = (result: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        subscriptionPlanId: 'plan-1',
      }),
      getMany: jest.fn().mockResolvedValue(result),
    });
    const managerRepositories = new Map<any, any>([
      [Tenant, { createQueryBuilder: jest.fn(() => query([])) }],
      [
        SubscriptionPlan,
        {
          findOne: jest.fn().mockResolvedValue({
            id: 'plan-1',
            status: 'active',
            monthlyPrice: 30000,
          }),
        },
      ],
      [
        TenantSubscriptionPeriod,
        { createQueryBuilder: jest.fn(() => query([])) },
      ],
      [TenantBillingRecord, { createQueryBuilder: jest.fn(() => query([])) }],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager });

    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'first-next-month',
        startOption: 'next_month',
      }),
    ).rejects.toThrow(
      'Requesting a future month requires an active paid subscription for the current month; purchase or upgrade for the current month first.',
    );
  });

  it('derives the next sequential month when the current month is already paid', async () => {
    const query = (result: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValue({ id: 'tenant-1', subscriptionPlanId: 'plan-1' }),
      getMany: jest.fn().mockResolvedValue(result),
    });
    const paidRecord = {
      id: 'billing-1',
      billingPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      billingPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      invoiceStatus: 'issued',
      paymentStatus: 'paid',
      reviewStatus: 'confirm',
      metadata: {
        purchaseRequestType: 'subscription_period',
        idempotencyKey: 'first',
      },
    };
    const savedRecord = {
      id: 'billing-2',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      invoiceNumber: null,
    };
    const managerRepositories = new Map<any, any>([
      [
        Tenant,
        {
          createQueryBuilder: jest.fn(() =>
            query({ id: 'tenant-1', subscriptionPlanId: 'plan-1' }),
          ),
        },
      ],
      [
        SubscriptionPlan,
        {
          findOne: jest.fn().mockResolvedValue({
            id: 'plan-1',
            status: 'active',
            monthlyPrice: 30000,
          }),
        },
      ],
      [
        TenantSubscriptionPeriod,
        { createQueryBuilder: jest.fn(() => query([])) },
      ],
      [
        TenantBillingRecord,
        {
          createQueryBuilder: jest.fn(() => query([paidRecord])),
          create: jest.fn((value) => value),
          save: jest.fn().mockResolvedValue(savedRecord),
        },
      ],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager });

    // August is already paid, so next_month should derive September (the
    // next sequential unoccupied month).
    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'second',
        startOption: 'next_month',
      }),
    ).resolves.toMatchObject({
      purchase: {
        periodStatus: 'upcoming',
        reviewStatus: 'in_review',
      },
    });
  });

  it('allows a sequential request while a current-month upgrade is still unconfirmed', async () => {
    const now = new Date();
    const currentStart = yangonMonthStart(now);
    const currentEnd = yangonMonthEnd(now);
    const query = (result: unknown, one: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(one),
      getMany: jest.fn().mockResolvedValue(result),
    });
    const currentPeriod = {
      id: 'period-current',
      tenantId: 'tenant-1',
      planId: 'plan-current',
      periodType: 'paid',
      periodStatus: 'active',
      paymentStatus: 'paid',
      reviewStatus: 'confirm',
      monthStartAt: currentStart,
      monthEndAt: currentEnd,
      periodStartAt: currentStart,
      periodEndAt: currentEnd,
      sequenceNumber: 1,
    };
    const pendingUpgrade = {
      id: 'upgrade-invoice',
      subscriptionPlanId: 'plan-next',
      billingPeriodStart: currentStart,
      billingPeriodEnd: currentEnd,
      invoiceStatus: 'issued',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      metadata: { purchaseRequestType: 'upgrade' },
    };
    const savedRecord = {
      id: 'next-month-invoice',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      invoiceNumber: null,
    };
    const managerRepositories = new Map<any, any>([
      [
        Tenant,
        {
          createQueryBuilder: jest.fn(() =>
            query([], { id: 'tenant-1', subscriptionPlanId: 'plan-current' }),
          ),
        },
      ],
      [
        SubscriptionPlan,
        {
          findOne: jest.fn().mockResolvedValue({
            id: 'plan-next',
            status: 'active',
            monthlyPrice: 50000,
          }),
        },
      ],
      [
        TenantSubscriptionPeriod,
        { createQueryBuilder: jest.fn(() => query([currentPeriod], null)) },
      ],
      [
        TenantBillingRecord,
        {
          createQueryBuilder: jest.fn(() => query([pendingUpgrade], null)),
          create: jest.fn((value) => value),
          save: jest.fn().mockResolvedValue(savedRecord),
        },
      ],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager });

    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'next-after-pending-upgrade',
        startOption: 'next_month',
        subscriptionPlanId: 'plan-next',
      }),
    ).resolves.toMatchObject({
      purchase: {
        periodStatus: 'upcoming',
        reviewStatus: 'in_review',
      },
    });
  });

  it('does not let an unrelated unpaid invoice block a subscription request', async () => {
    const query = (result: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValue({ id: 'tenant-1', subscriptionPlanId: 'plan-1' }),
      getMany: jest.fn().mockResolvedValue(result),
    });
    const unrelatedInvoice = {
      id: 'invoice-1',
      billingPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      billingPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      invoiceStatus: 'issued',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      metadata: { source: 'other_billing_flow' },
    };
    const managerRepositories = new Map<any, any>([
      [
        Tenant,
        {
          createQueryBuilder: jest.fn(() =>
            query({ id: 'tenant-1', subscriptionPlanId: 'plan-1' }),
          ),
        },
      ],
      [
        SubscriptionPlan,
        {
          findOne: jest.fn().mockResolvedValue({
            id: 'plan-1',
            status: 'active',
            monthlyPrice: 30000,
          }),
        },
      ],
      [
        TenantSubscriptionPeriod,
        { createQueryBuilder: jest.fn(() => query([])) },
      ],
      [
        TenantBillingRecord,
        {
          createQueryBuilder: jest.fn(() => query([unrelatedInvoice])),
          create: jest.fn((value) => value),
          save: jest
            .fn()
            .mockResolvedValue({ id: 'billing-2', reviewStatus: 'in_review' }),
        },
      ],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager });

    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'subscription-1',
        startOption: 'current_month',
      }),
    ).resolves.toMatchObject({
      purchase: { reviewStatus: 'in_review' },
    });
  });

  it('returns the existing request for an idempotent retry', async () => {
    const existing = {
      id: 'billing-1',
      billingPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      billingPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      amountDue: 30000,
      currency: 'MMK',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      metadata: {
        purchaseRequestType: 'subscription_period',
        idempotencyKey: 'same-key',
        requestedStartOption: 'current_month',
        startOption: 'current_month',
      },
    };
    const query = (result: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValue({ id: 'tenant-1', subscriptionPlanId: 'plan-1' }),
      getMany: jest.fn().mockResolvedValue(result),
    });
    const managerRepositories = new Map<any, any>([
      [
        Tenant,
        {
          createQueryBuilder: jest.fn(() =>
            query({ id: 'tenant-1', subscriptionPlanId: 'plan-1' }),
          ),
        },
      ],
      [
        SubscriptionPlan,
        {
          findOne: jest.fn().mockResolvedValue({
            id: 'plan-1',
            status: 'active',
            monthlyPrice: 30000,
          }),
        },
      ],
      [
        TenantSubscriptionPeriod,
        { createQueryBuilder: jest.fn(() => query([])) },
      ],
      [
        TenantBillingRecord,
        { createQueryBuilder: jest.fn(() => query([existing])) },
      ],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager });

    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'same-key',
        startOption: 'current_month',
      }),
    ).resolves.toMatchObject({ billingRecord: existing });
  });

  it('returns billing overview with canonical usage-event freshness metadata', async () => {
    const { service, repositories } = createService();
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      companyName: 'Shop 1',
      status: 'active',
      subscriptionPlanId: 'plan-current',
      subscriptionEndDate: '2026-07-31T00:00:00.000Z',
      customAgentLimit: null,
      customChannelLimit: null,
      customMessageLimit: null,
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-current',
      name: 'Starter',
      monthlyPrice: 30000,
      maxAgents: 3,
      maxChannels: 2,
      messageLimit: 1000,
      storageLimitGb: 5,
    });
    repositories.tenantUser.count.mockResolvedValue(2);
    repositories.tenantChannel.count.mockResolvedValue(0);
    repositories.tenantChannel.find.mockResolvedValue([
      { status: 'pending', connectionStatus: 'ready' },
    ]);
    repositories.tenantUsage.createQueryBuilder
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '25' }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest
          .fn()
          .mockResolvedValue({ latest: '2026-07-10T10:00:00.000Z' }),
      });
    repositories.tenantBillingRecord.find.mockResolvedValue([]);

    await expect(service.getTenantBilling('tenant-1')).resolves.toMatchObject({
      tenant: {
        companyName: 'Shop 1',
        renewalDate: '2026-07-31T00:00:00.000Z',
      },
      plan: {
        id: 'plan-current',
      },
      usage: {
        monthlyMessages: 25,
        teamMembers: 2,
        connectedChannels: 1,
        source: 'tenant_usage_events',
        latestUsageEventAt: '2026-07-10T10:00:00.000Z',
        metrics: {
          monthlyMessages: expect.objectContaining({
            key: 'providerMessages',
            used: 25,
            limit: 1000,
          }),
          teamMembers: expect.objectContaining({
            key: 'agents',
            used: 2,
            limit: 3,
          }),
          connectedChannels: expect.objectContaining({
            key: 'channels',
            used: 1,
            limit: 2,
          }),
        },
      },
    });
  });

  it('creates a persisted request for a different active plan', async () => {
    const { service, repositories } = createService();
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      tenantCode: 'SHOP-1',
      companyName: 'Shop 1',
      contactEmail: 'owner@shop.test',
      contactPhone: '0912345678',
      businessType: 'retail',
      contactPerson: 'Owner Name',
      subscriptionPlanId: 'plan-current',
    });
    repositories.subscriptionPlan.findOne
      .mockResolvedValueOnce({
        id: 'plan-next',
        name: 'Growth',
        status: 'active',
      })
      .mockResolvedValueOnce({
        id: 'plan-current',
        name: 'Starter',
        status: 'active',
      });
    repositories.tenantUser.findOne.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      fullName: 'Owner Name',
      phone: '0912345678',
    });

    await expect(
      service.requestPlanChange('tenant-1', 'user-1', 'owner', {
        desiredPlanId: 'plan-next',
        note: 'Need more message volume',
      }),
    ).resolves.toMatchObject({
      status: 'pending',
      currentPlan: { id: 'plan-current', name: 'Starter' },
      desiredPlan: { id: 'plan-next', name: 'Growth' },
      note: 'Need more message volume',
    });

    expect(repositories.lead.save).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'workspace-plan-change',
        interestedIn: 'Growth',
        metadata: expect.objectContaining({
          requestType: 'plan_change',
          tenantId: 'tenant-1',
          desiredPlanId: 'plan-next',
        }),
      }),
    );
  });

  it('rejects duplicate open plan change requests', async () => {
    const { service, repositories } = createService();
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      tenantCode: 'SHOP-1',
      companyName: 'Shop 1',
      contactEmail: 'owner@shop.test',
      subscriptionPlanId: 'plan-current',
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-next',
      name: 'Growth',
      status: 'active',
    });
    repositories.lead.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'lead-open' }),
    });

    await expect(
      service.requestPlanChange('tenant-1', 'user-1', 'owner', {
        desiredPlanId: 'plan-next',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects selecting the current plan or an unknown plan', async () => {
    const { service, repositories } = createService();
    repositories.tenant.findOne.mockResolvedValue({
      id: 'tenant-1',
      tenantCode: 'SHOP-1',
      companyName: 'Shop 1',
      contactEmail: 'owner@shop.test',
      subscriptionPlanId: 'plan-current',
    });
    repositories.subscriptionPlan.findOne.mockResolvedValue({
      id: 'plan-current',
      name: 'Starter',
      status: 'active',
    });

    await expect(
      service.requestPlanChange('tenant-1', 'user-1', 'owner', {
        desiredPlanId: 'plan-current',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    repositories.subscriptionPlan.findOne.mockResolvedValue(null);
    await expect(
      service.requestPlanChange('tenant-1', 'user-1', 'owner', {
        desiredPlanId: 'missing-plan',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists tenant plan change requests with resolved statuses', async () => {
    const { service, repositories } = createService();
    repositories.lead.find.mockResolvedValue([
      {
        id: 'lead-approved',
        source: 'workspace-plan-change',
        status: 'converted',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        metadata: {
          requestType: 'plan_change',
          tenantId: 'tenant-1',
          requestedAt: '2026-07-01T00:00:00.000Z',
          resolvedAt: '2026-07-02T00:00:00.000Z',
          currentPlanId: 'plan-starter',
          currentPlanName: 'Starter',
          desiredPlanId: 'plan-growth',
          desiredPlanName: 'Growth',
        },
      },
      {
        id: 'lead-cancelled',
        source: 'workspace-plan-change',
        status: 'closed',
        createdAt: new Date('2026-07-03T00:00:00.000Z'),
        metadata: {
          requestType: 'plan_change',
          tenantId: 'tenant-1',
          outcome: 'cancelled',
          desiredPlanId: 'plan-pro',
          desiredPlanName: 'Pro',
        },
      },
      {
        id: 'lead-other-tenant',
        source: 'workspace-plan-change',
        status: 'new',
        createdAt: new Date('2026-07-04T00:00:00.000Z'),
        metadata: {
          requestType: 'plan_change',
          tenantId: 'tenant-2',
          desiredPlanId: 'plan-other',
          desiredPlanName: 'Other',
        },
      },
    ]);

    await expect(service.listPlanChangeRequests('tenant-1')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'lead-cancelled',
          status: 'cancelled',
          desiredPlan: { id: 'plan-pro', name: 'Pro' },
        }),
        expect.objectContaining({
          id: 'lead-approved',
          status: 'approved',
          resolvedAt: '2026-07-02T00:00:00.000Z',
          currentPlan: { id: 'plan-starter', name: 'Starter' },
        }),
      ]),
    );
  });

  it('cancels a pending tenant plan change request', async () => {
    const { service, repositories } = createService();
    repositories.lead.findOne.mockResolvedValue({
      id: 'lead-1',
      source: 'workspace-plan-change',
      status: 'new',
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      metadata: {
        requestType: 'plan_change',
        tenantId: 'tenant-1',
        desiredPlanId: 'plan-growth',
        desiredPlanName: 'Growth',
      },
    });

    await expect(
      service.cancelPlanChangeRequest('tenant-1', 'user-7', 'lead-1'),
    ).resolves.toMatchObject({
      id: 'lead-1',
      status: 'cancelled',
      desiredPlan: { id: 'plan-growth', name: 'Growth' },
    });

    expect(repositories.lead.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'lead-1',
        status: 'closed',
        metadata: expect.objectContaining({
          outcome: 'cancelled',
          cancelledByUserId: 'user-7',
        }),
      }),
    );
  });

  it('does not allow cross-tenant payment-proof access', async () => {
    const { service, repositories } = createService();
    repositories.tenantBillingRecord.findOne.mockResolvedValue(null);

    await expect(
      service.submitPaymentProof('tenant-1', 'billing-1', 'user-1', {
        paymentMethod: 'bank_transfer',
        paidAmount: 1000,
        paidDate: '2026-07-10',
        mediaFileId: 'file-1',
        fileName: 'proof.png',
        mediaScanStatus: 'clean',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('submits clean payment proof without self-confirming payment or activating access', async () => {
    const { service, repositories, mediaLibraryService } = createService();
    repositories.tenantBillingRecord.findOne.mockResolvedValue({
      id: 'billing-1',
      tenantId: 'tenant-1',
      paymentStatus: 'overdue',
      reviewStatus: 'in_review',
      metadata: {},
    });
    repositories.tenantBillingRecord.save.mockImplementation(
      async (record) => record,
    );

    await expect(
      service.submitPaymentProof('tenant-1', 'billing-1', 'user-1', {
        paymentMethod: 'bank_transfer',
        paidAmount: 1000,
        paidDate: '2026-07-10',
        transactionReference: 'BANK-123',
        mediaFileId: 'file-1',
        fileName: 'proof.png',
        mediaScanStatus: 'clean',
      }),
    ).resolves.toMatchObject({
      reviewStatus: 'in_review',
      proof: {
        status: 'pending_review',
        reviewStatus: 'pending_review',
        mediaScanStatus: 'clean',
        transactionReference: 'BANK-123',
        submittedBy: 'user-1',
      },
    });

    expect(mediaLibraryService.getBillingProofFile).toHaveBeenCalledWith(
      'tenant-1',
      'file-1',
    );
    expect(repositories.tenantBillingRecord.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewStatus: 'in_review',
        // Regression 2026-09-09: the file service issues opaque `file-…`
        // string IDs — the column must persist them verbatim (uuid 500'd).
        paymentProofFileId: 'file-1',
        metadata: expect.objectContaining({
          paymentProof: expect.objectContaining({
            status: 'pending_review',
            mediaScanStatus: 'clean',
          }),
          paymentProofSubmissions: [
            expect.objectContaining({
              status: 'pending_review',
              mediaScanStatus: 'clean',
            }),
          ],
        }),
      }),
    );
  });

  it('rejects payment proof that has not passed media quarantine', async () => {
    const { service, repositories } = createService();
    repositories.tenantBillingRecord.findOne.mockResolvedValue({
      id: 'billing-1',
      tenantId: 'tenant-1',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      metadata: {},
    });

    await expect(
      service.submitPaymentProof('tenant-1', 'billing-1', 'user-1', {
        paymentMethod: 'bank_transfer',
        paidAmount: 1000,
        paidDate: '2026-07-10',
        mediaFileId: 'file-1',
        fileName: 'proof.png',
        mediaScanStatus: 'quarantined' as any,
      }),
    ).rejects.toThrow(
      'Payment proof must pass media quarantine before submission',
    );
    expect(repositories.tenantBillingRecord.save).not.toHaveBeenCalled();
  });

  it('rejects payment proof for an invoice-rejected record (Plan 28 Item 1)', async () => {
    const { service, repositories } = createService();
    repositories.tenantBillingRecord.findOne.mockResolvedValue({
      id: 'billing-1',
      tenantId: 'tenant-1',
      reviewStatus: 'reject',
      metadata: {},
    });

    await expect(
      service.submitPaymentProof('tenant-1', 'billing-1', 'user-1', {
        paymentMethod: 'bank_transfer',
        paidAmount: 1000,
        paidDate: '2026-07-10',
        mediaFileId: 'file-1',
        fileName: 'proof.png',
        mediaScanStatus: 'clean',
      }),
    ).rejects.toThrow(
      'This invoice was rejected; submit a new purchase request instead',
    );
    expect(repositories.tenantBillingRecord.save).not.toHaveBeenCalled();
  });

  it('rejects a payment proof that references a non-billing-purpose file', async () => {
    const mediaLibraryService = {
      getBillingProofFile: jest
        .fn()
        .mockRejectedValue(
          new NotFoundException('Billing payment-proof file not found'),
        ),
    };
    const { service, repositories } = createService({ mediaLibraryService });
    repositories.tenantBillingRecord.findOne.mockResolvedValue({
      id: 'billing-1',
      tenantId: 'tenant-1',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      metadata: {},
    });

    await expect(
      service.submitPaymentProof('tenant-1', 'billing-1', 'user-1', {
        paymentMethod: 'bank_transfer',
        paidAmount: 1000,
        paidDate: '2026-07-10',
        mediaFileId: 'wrong-purpose-file',
        fileName: 'not-a-receipt.png',
        mediaScanStatus: 'clean',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repositories.tenantBillingRecord.save).not.toHaveBeenCalled();
  });

  it('rejects a payment proof that references an upload that is not complete', async () => {
    const mediaLibraryService = {
      getBillingProofFile: jest
        .fn()
        .mockRejectedValue(
          new NotFoundException('Billing payment-proof file not found'),
        ),
    };
    const { service, repositories } = createService({ mediaLibraryService });
    repositories.tenantBillingRecord.findOne.mockResolvedValue({
      id: 'billing-1',
      tenantId: 'tenant-1',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      metadata: {},
    });

    await expect(
      service.submitPaymentProof('tenant-1', 'billing-1', 'user-1', {
        paymentMethod: 'bank_transfer',
        paidAmount: 1000,
        paidDate: '2026-07-10',
        mediaFileId: 'incomplete-file',
        fileName: 'receipt.png',
        mediaScanStatus: 'clean',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repositories.tenantBillingRecord.save).not.toHaveBeenCalled();
  });

  it('rejects a payment proof file that belongs to another tenant', async () => {
    const mediaLibraryService = {
      getBillingProofFile: jest
        .fn()
        .mockRejectedValue(
          new NotFoundException('Billing payment-proof file not found'),
        ),
    };
    const { service, repositories } = createService({ mediaLibraryService });
    repositories.tenantBillingRecord.findOne.mockResolvedValue({
      id: 'billing-1',
      tenantId: 'tenant-1',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      metadata: {},
    });

    await expect(
      service.submitPaymentProof('tenant-1', 'billing-1', 'user-1', {
        paymentMethod: 'bank_transfer',
        paidAmount: 1000,
        paidDate: '2026-07-10',
        mediaFileId: 'other-tenant-file',
        fileName: 'receipt.png',
        mediaScanStatus: 'clean',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repositories.tenantBillingRecord.save).not.toHaveBeenCalled();
  });

  it('rejects duplicate pending payment-proof submissions', async () => {
    const { service, repositories } = createService();
    repositories.tenantBillingRecord.findOne.mockResolvedValue({
      id: 'billing-1',
      tenantId: 'tenant-1',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      metadata: {
        paymentProof: {
          status: 'pending_review',
          submittedAt: '2026-07-10T00:00:00.000Z',
        },
      },
    });

    await expect(
      service.submitPaymentProof('tenant-1', 'billing-1', 'user-1', {
        paymentMethod: 'bank_transfer',
        paidAmount: 1000,
        paidDate: '2026-07-10',
        mediaFileId: 'file-1',
        fileName: 'proof.png',
        mediaScanStatus: 'clean',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repositories.tenantBillingRecord.save).not.toHaveBeenCalled();
  });

  // ─── Phase 1 regression: selected-plan purchase ───

  it('purchases a different active plan when subscriptionPlanId is provided', async () => {
    const query = (result: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(result),
      getMany: jest.fn().mockResolvedValue(result),
    });
    const tenant = {
      id: 'tenant-1',
      subscriptionPlanId: 'plan-current',
    };
    const selectedPlan = {
      id: 'plan-growth',
      name: 'Growth',
      status: 'active',
      monthlyPrice: 50000,
    };
    const savedRecord = {
      id: 'billing-selected-plan',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      invoiceNumber: null,
    };
    const managerRepositories = new Map<any, any>([
      [Tenant, { createQueryBuilder: jest.fn(() => query(tenant)) }],
      [
        SubscriptionPlan,
        { findOne: jest.fn().mockResolvedValue(selectedPlan) },
      ],
      [
        TenantSubscriptionPeriod,
        { createQueryBuilder: jest.fn(() => query([])) },
      ],
      [
        TenantBillingRecord,
        {
          createQueryBuilder: jest.fn(() => query([])),
          create: jest.fn((value) => value),
          save: jest.fn().mockResolvedValue(savedRecord),
        },
      ],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager });

    const result = await service.createSubscriptionPurchaseRequest('tenant-1', {
      idempotencyKey: 'selected-plan-purchase',
      startOption: 'current_month',
      subscriptionPlanId: 'plan-growth',
    });

    // Should use the selected plan's price, not the tenant's assigned plan
    expect(result.purchase).toMatchObject({
      amountDue: 50000,
      periodStatus: 'pending_activation',
    });
    expect(
      managerRepositories.get(TenantBillingRecord).create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionPlanId: 'plan-growth',
        amountDue: 50000,
        metadata: expect.objectContaining({
          selectedPlanId: 'plan-growth',
        }),
      }),
    );
  });

  it('rejects an inactive selected plan', async () => {
    const query = (result: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(result),
      getMany: jest.fn().mockResolvedValue(result),
    });
    const tenant = {
      id: 'tenant-1',
      subscriptionPlanId: 'plan-1',
    };
    const managerRepositories = new Map<any, any>([
      [Tenant, { createQueryBuilder: jest.fn(() => query(tenant)) }],
      [
        SubscriptionPlan,
        {
          findOne: jest.fn().mockResolvedValue(null), // inactive or missing
        },
      ],
      [
        TenantSubscriptionPeriod,
        { createQueryBuilder: jest.fn(() => query([])) },
      ],
      [TenantBillingRecord, { createQueryBuilder: jest.fn(() => query([])) }],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager });

    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'inactive-plan',
        startOption: 'current_month',
        subscriptionPlanId: 'plan-archived',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── Phase 1 regression: future invoice does not block current-month ───

  it('allows current-month request when only a future unpaid invoice exists', async () => {
    const query = (result: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValue({ id: 'tenant-1', subscriptionPlanId: 'plan-1' }),
      getMany: jest.fn().mockResolvedValue(result),
    });
    // Future unpaid invoice for September
    const futureInvoice = {
      id: 'billing-future',
      billingPeriodStart: new Date('2026-09-01T00:00:00.000Z'),
      billingPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
      invoiceStatus: 'issued',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      metadata: {
        purchaseRequestType: 'subscription_period',
        idempotencyKey: 'future-key',
      },
    };
    const savedRecord = {
      id: 'billing-current',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      invoiceNumber: null,
    };
    const managerRepositories = new Map<any, any>([
      [
        Tenant,
        {
          createQueryBuilder: jest.fn(() =>
            query({ id: 'tenant-1', subscriptionPlanId: 'plan-1' }),
          ),
        },
      ],
      [
        SubscriptionPlan,
        {
          findOne: jest.fn().mockResolvedValue({
            id: 'plan-1',
            status: 'active',
            monthlyPrice: 30000,
          }),
        },
      ],
      [
        TenantSubscriptionPeriod,
        { createQueryBuilder: jest.fn(() => query([])) },
      ],
      [
        TenantBillingRecord,
        {
          createQueryBuilder: jest.fn(() => query([futureInvoice])),
          create: jest.fn((value) => value),
          save: jest.fn().mockResolvedValue(savedRecord),
        },
      ],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager });

    // The future unpaid invoice should NOT block a current_month request.
    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'current-month-now',
        startOption: 'current_month',
      }),
    ).resolves.toMatchObject({
      purchase: {
        periodStatus: 'pending_activation',
        reviewStatus: 'in_review',
      },
    });

    // Without an active paid current period, a next-month request is blocked
    // by the Plan 14 (7.37c) guard before the pending-reservation check.
    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'another-future-request',
        startOption: 'next_month',
      }),
    ).rejects.toThrow(
      'Requesting a future month requires an active paid subscription for the current month; purchase or upgrade for the current month first.',
    );
  });

  it('prevents duplicate current-month invoice when a current-month unpaid reservation exists', async () => {
    const query = (result: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockResolvedValue({ id: 'tenant-1', subscriptionPlanId: 'plan-1' }),
      getMany: jest.fn().mockResolvedValue(result),
    });
    // Current-month unpaid invoice
    const currentInvoice = {
      id: 'billing-current-unpaid',
      billingPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      billingPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      invoiceStatus: 'issued',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      metadata: {
        purchaseRequestType: 'subscription_period',
        idempotencyKey: 'existing-current',
      },
    };
    const managerRepositories = new Map<any, any>([
      [
        Tenant,
        {
          createQueryBuilder: jest.fn(() =>
            query({ id: 'tenant-1', subscriptionPlanId: 'plan-1' }),
          ),
        },
      ],
      [
        SubscriptionPlan,
        {
          findOne: jest.fn().mockResolvedValue({
            id: 'plan-1',
            status: 'active',
            monthlyPrice: 30000,
          }),
        },
      ],
      [
        TenantSubscriptionPeriod,
        { createQueryBuilder: jest.fn(() => query([])) },
      ],
      [
        TenantBillingRecord,
        { createQueryBuilder: jest.fn(() => query([currentInvoice])) },
      ],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager });

    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'duplicate-current',
        startOption: 'current_month',
      }),
    ).rejects.toThrow(
      'A pending payment already reserves the current Yangon month',
    );

    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'sequential-while-pending',
        startOption: 'next_month',
      }),
    ).rejects.toThrow(
      'Requesting a future month requires an active paid subscription for the current month; purchase or upgrade for the current month first.',
    );
  });
});

describe('TenantService chained upgrades (Plan 54)', () => {
  const query = (result: unknown) => ({
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
    getMany: jest.fn().mockResolvedValue(result),
  });

  const chainPeriod = () => {
    const currentStart = yangonMonthStart(new Date());
    const currentEnd = yangonMonthEnd(new Date());
    return {
      id: 'period-chain',
      // Post-approval state: the period already points at the latest target.
      planId: 'plan-high',
      periodType: 'paid',
      periodStatus: 'active',
      paymentStatus: 'paid',
      adminActivationStatus: 'approved',
      monthStartAt: currentStart,
      monthEndAt: currentEnd,
      periodStartAt: currentStart,
      periodEndAt: currentEnd,
      sequenceNumber: 2,
    };
  };

  const chainPlans = () => ({
    'plan-high': {
      id: 'plan-high',
      status: 'active',
      planType: 'business',
      monthlyPrice: 500000,
      inboundMessageLimit: 10000,
      outboundMessageLimit: 5000,
      maxChannels: 3,
      storageLimitGb: 10,
      maxAgents: 5,
    },
    'plan-ultra': {
      id: 'plan-ultra',
      status: 'active',
      planType: 'business',
      monthlyPrice: 800000,
      inboundMessageLimit: 20000,
      outboundMessageLimit: 10000,
      maxChannels: 5,
      storageLimitGb: 25,
      maxAgents: 10,
    },
  });

  function chainSetup(existingRevision: unknown) {
    const plans = chainPlans();
    const savedRecord = { id: 'upgrade-record-2', reviewStatus: 'in_review' };
    const savedRevision = {
      id: 'upgrade-revision-2',
      upgradedPlanId: 'plan-ultra',
      upgradeStatus: 'requested',
    };
    const managerRepositories = new Map<any, any>([
      [
        Tenant,
        {
          createQueryBuilder: jest.fn(() =>
            query({ id: 'tenant-1', subscriptionPlanId: 'plan-high' }),
          ),
        },
      ],
      [
        SubscriptionPlan,
        {
          findOne: jest.fn(async ({ where }: any) => plans[where.id] ?? null),
        },
      ],
      [
        TenantSubscriptionPeriod,
        { createQueryBuilder: jest.fn(() => query([chainPeriod()])) },
      ],
      [
        TenantBillingRecord,
        {
          createQueryBuilder: jest.fn(() => query([])),
          create: jest.fn((value) => value),
          save: jest.fn().mockResolvedValue(savedRecord),
        },
      ],
      [
        TenantSubscriptionPeriodUpgradeRevision,
        {
          findOne: jest.fn().mockResolvedValue(existingRevision),
          create: jest.fn((value) => value),
          save: jest.fn().mockResolvedValue(savedRevision),
        },
      ],
      [
        SubscriptionPeriodEvent,
        {
          create: jest.fn((value) => value),
          save: jest.fn().mockResolvedValue({ id: 'event-1' }),
        },
      ],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager });
    return { service, savedRevision };
  }

  it('allows a second upgrade after an approved one when the target is greater', async () => {
    const { service, savedRevision } = chainSetup({
      id: 'upgrade-revision-1',
      previousPlanId: 'plan-high',
      upgradedPlanId: 'plan-high',
      upgradeStatus: 'approved',
      metadata: { idempotencyKey: 'first-upgrade' },
    });

    const result = await service.createSubscriptionPurchaseRequest('tenant-1', {
      idempotencyKey: 'second-upgrade',
      startOption: 'current_month',
      subscriptionPlanId: 'plan-ultra',
    });

    expect(result.purchase).toMatchObject({
      kind: 'upgrade',
      targetPlanId: 'plan-ultra',
      upgradeRevisionId: savedRevision.id,
    });
  });

  it('blocks a new upgrade while one is still in progress', async () => {
    const { service } = chainSetup({
      id: 'upgrade-revision-1',
      upgradeStatus: 'pending_approval',
      metadata: { idempotencyKey: 'first-upgrade' },
    });

    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'second-upgrade',
        startOption: 'current_month',
        subscriptionPlanId: 'plan-ultra',
      }),
    ).rejects.toThrow('already in progress');
  });
});

describe('TenantService mid-month upgrade classification (Plan 42)', () => {
  const query = (result: unknown) => ({
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
    getMany: jest.fn().mockResolvedValue(result),
  });

  // After-trial periods start at trial expiry (mid-month), not the 1st.
  const midMonthPeriod = () => {
    const currentStart = yangonMonthStart(new Date());
    const currentEnd = yangonMonthEnd(new Date());
    return {
      id: 'period-mid-month',
      planId: 'plan-current',
      periodType: 'paid',
      periodStatus: 'active',
      paymentStatus: 'paid',
      adminActivationStatus: 'approved',
      monthStartAt: new Date(currentStart.getTime() + 15 * 86400000),
      monthEndAt: currentEnd,
      periodStartAt: new Date(currentStart.getTime() + 15 * 86400000),
      periodEndAt: currentEnd,
      sequenceNumber: 2,
    };
  };

  const planFixtures = () => ({
    'plan-current': {
      id: 'plan-current',
      status: 'active',
      planType: 'business',
      monthlyPrice: 300000,
      inboundMessageLimit: 1000,
      outboundMessageLimit: 1000,
      maxChannels: 3,
      storageLimitGb: 10,
      maxAgents: 5,
    },
    'plan-high': {
      id: 'plan-high',
      status: 'active',
      planType: 'business',
      monthlyPrice: 500000,
      inboundMessageLimit: 1000,
      outboundMessageLimit: 1000,
      maxChannels: 3,
      storageLimitGb: 10,
      maxAgents: 5,
    },
  });

  function setup(options: {
    periods: unknown[];
    records: unknown[];
    targetPlanId: string;
  }) {
    const plans = planFixtures();
    const savedRecord = {
      id: 'upgrade-record-1',
      reviewStatus: 'in_review',
      amountDue: 500000,
      currency: 'MMK',
    };
    const savedRevision = {
      id: 'upgrade-revision-1',
      previousPlanId: 'plan-current',
      upgradedPlanId: options.targetPlanId,
      upgradeStatus: 'requested',
    };
    const managerRepositories = new Map<any, any>([
      [
        Tenant,
        {
          createQueryBuilder: jest.fn(() =>
            query({ id: 'tenant-1', subscriptionPlanId: 'plan-current' }),
          ),
        },
      ],
      [
        SubscriptionPlan,
        {
          findOne: jest.fn(async ({ where }: any) => plans[where.id] ?? null),
        },
      ],
      [
        TenantSubscriptionPeriod,
        { createQueryBuilder: jest.fn(() => query(options.periods)) },
      ],
      [
        TenantBillingRecord,
        {
          createQueryBuilder: jest.fn(() => query(options.records)),
          create: jest.fn((value) => value),
          save: jest.fn().mockResolvedValue(savedRecord),
        },
      ],
      [
        TenantSubscriptionPeriodUpgradeRevision,
        {
          findOne: jest.fn().mockResolvedValue(null),
          create: jest.fn((value) => value),
          save: jest.fn().mockResolvedValue(savedRevision),
        },
      ],
      [
        SubscriptionPeriodEvent,
        {
          create: jest.fn((value) => value),
          save: jest.fn().mockResolvedValue({ id: 'event-1' }),
        },
      ],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback) => callback(billingManager)),
    };
    const { service } = createService({ billingManager });
    return { service, managerRepositories, savedRecord, savedRevision };
  }

  it('classifies a mid-month active paid period + higher plan as an upgrade', async () => {
    const { service, managerRepositories, savedRevision } = setup({
      periods: [midMonthPeriod()],
      records: [],
      targetPlanId: 'plan-high',
    });

    const result = await service.createSubscriptionPurchaseRequest('tenant-1', {
      idempotencyKey: 'mid-month-upgrade',
      startOption: 'current_month',
      subscriptionPlanId: 'plan-high',
    });

    expect(
      managerRepositories.get(TenantSubscriptionPeriodUpgradeRevision).save,
    ).toHaveBeenCalledTimes(1);
    expect(result.purchase).toMatchObject({
      kind: 'upgrade',
      startOption: 'current_month',
      targetPlanId: 'plan-high',
      upgradeRevisionId: savedRevision.id,
      upgradeStatus: 'requested',
    });
    expect(result.billingRecord).toMatchObject({ id: 'upgrade-record-1' });
  });

  it('still rejects an equal-priced plan for a mid-month period as occupied', async () => {
    const currentStart = yangonMonthStart(new Date());
    const { service } = setup({
      periods: [midMonthPeriod()],
      records: [
        {
          id: 'billing-confirmed',
          reviewStatus: 'confirm',
          billingPeriodStart: new Date(currentStart.getTime()),
          billingPeriodEnd: yangonMonthEnd(new Date()),
          subscriptionPlanId: 'plan-current',
          metadata: { purchaseRequestType: 'subscription_period' },
        },
      ],
      targetPlanId: 'plan-current',
    });

    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'mid-month-equal',
        startOption: 'current_month',
        subscriptionPlanId: 'plan-current',
      }),
    ).rejects.toThrow(
      'The current Yangon month is already occupied; purchase the next sequential month instead.',
    );
  });

  it('still classifies an exact month-start active period as an upgrade', async () => {
    const currentStart = yangonMonthStart(new Date());
    const period = {
      ...midMonthPeriod(),
      monthStartAt: new Date(currentStart.getTime()),
      periodStartAt: new Date(currentStart.getTime()),
    };
    const { service } = setup({
      periods: [period],
      records: [],
      targetPlanId: 'plan-high',
    });

    const result = await service.createSubscriptionPurchaseRequest('tenant-1', {
      idempotencyKey: 'exact-start-upgrade',
      startOption: 'current_month',
      subscriptionPlanId: 'plan-high',
    });

    expect(result.purchase).toMatchObject({
      kind: 'upgrade',
      targetPlanId: 'plan-high',
    });
  });
});

describe('TenantService trial conversion classification (Plan 14 Phase 2)', () => {
  function buildConversionManager(
    opts: {
      existingRevision?: any;
      billingRecords?: any[];
    } = {},
  ) {
    const now = new Date();
    const currentStart = yangonMonthStart(now);
    const currentEnd = yangonMonthEnd(now);
    const trialPeriod = {
      id: 'trial-period-1',
      tenantId: 'tenant-1',
      planId: 'plan-trial',
      periodType: 'trial',
      periodStatus: 'active',
      paymentStatus: 'not_required',
      adminActivationStatus: 'approved',
      periodStartAt: currentStart,
      periodEndAt: currentEnd,
      monthStartAt: null,
      monthEndAt: null,
      sequenceNumber: 1,
      quotaSnapshot: {
        messageQuotaMode: 'directional',
        messageLimit: null,
        inboundMessageLimit: 1000,
        outboundMessageLimit: 500,
        allowedProviders: ['messenger'],
        durationDays: 30,
        maxChannels: 2,
        storageLimitGb: 1,
        maxAgents: 5,
        price: 0,
      },
      metadata: {},
    };
    const targetPlan = {
      id: 'plan-growth',
      name: 'Growth',
      status: 'active',
      planType: 'business',
      monthlyPrice: 500000,
      messageQuotaMode: 'directional',
      messageLimit: null,
      inboundMessageLimit: 20000,
      outboundMessageLimit: 8000,
      allowedProviders: ['messenger', 'telegram'],
      durationDays: 30,
      maxChannels: 4,
      storageLimitGb: 10,
      maxAgents: 10,
    };
    const trialPlan = {
      id: 'plan-trial',
      name: 'Trial',
      status: 'active',
      planType: 'trial',
      monthlyPrice: 0,
    };
    const savedRecord = {
      id: 'billing-conv',
      paymentStatus: 'unpaid',
      reviewStatus: 'in_review',
      invoiceNumber: null,
    };
    const savedRevision = {
      id: 'revision-1',
      upgradeStatus: 'requested',
      metadata: { kind: 'trial_conversion' },
    };
    const query = (result: unknown) => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        subscriptionPlanId: 'plan-trial',
      }),
      getMany: jest.fn().mockResolvedValue(result),
    });
    const managerRepositories = new Map<any, any>([
      [Tenant, { createQueryBuilder: jest.fn(() => query({})) }],
      [
        SubscriptionPlan,
        {
          findOne: jest.fn((where: any) =>
            Promise.resolve(
              where.where?.id === 'plan-trial' ? trialPlan : targetPlan,
            ),
          ),
        },
      ],
      [
        TenantSubscriptionPeriod,
        { createQueryBuilder: jest.fn(() => query([trialPeriod])) },
      ],
      [
        TenantBillingRecord,
        {
          createQueryBuilder: jest.fn(() => query(opts.billingRecords ?? [])),
          create: jest.fn((value: any) => value),
          save: jest.fn().mockResolvedValue(savedRecord),
        },
      ],
      [
        TenantSubscriptionPeriodUpgradeRevision,
        {
          findOne: jest.fn().mockResolvedValue(opts.existingRevision ?? null),
          create: jest.fn((value: any) => value),
          save: jest.fn(async (value: any) => ({
            ...value,
            id: 'revision-1',
          })),
        },
      ],
      [
        SubscriptionPeriodEvent,
        {
          create: jest.fn((value: any) => value),
          save: jest.fn(async (value: any) => value),
        },
      ],
    ]);
    const billingManager = {
      getRepository: jest.fn((entity: any) => managerRepositories.get(entity)),
      transaction: jest.fn(async (callback: any) => callback(billingManager)),
    };
    const { service } = createService({ billingManager });
    return {
      service,
      managerRepositories,
      savedRecord,
      savedRevision,
    };
  }

  it('classifies an unexpired operational trial + business target as a trial conversion request', async () => {
    const { service, managerRepositories } = buildConversionManager();

    const result = await service.createSubscriptionPurchaseRequest('tenant-1', {
      idempotencyKey: 'trial-conversion-1',
      startOption: 'current_month',
      subscriptionPlanId: 'plan-growth',
    });

    expect(result.purchase).toMatchObject({
      kind: 'trial_conversion',
      startOption: 'current_month',
      upgradeStatus: 'requested',
      previousPlanId: 'plan-trial',
      targetPlanId: 'plan-growth',
    });
    // A conversion billing record + revision + trial_conversion_requested event
    // are persisted.
    expect(
      managerRepositories.get(TenantBillingRecord).save,
    ).toHaveBeenCalled();
    expect(
      managerRepositories.get(TenantSubscriptionPeriodUpgradeRevision).save,
    ).toHaveBeenCalled();
    expect(
      managerRepositories.get(SubscriptionPeriodEvent).save,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'trial_conversion_requested' }),
    );
  });

  it('emails conversion invoices to the company email (Plan 30 E2)', async () => {
    const { service, managerRepositories } = buildConversionManager();
    const emailService = {
      sendInvoiceIssued: jest.fn().mockResolvedValue(true),
    };
    (service as any).emailService = emailService;
    (service as any).tenantRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'tenant-1',
        companyName: 'Acme Co',
        contactEmail: 'billing@acme.test',
      }),
    };

    await service.createSubscriptionPurchaseRequest('tenant-1', {
      idempotencyKey: 'trial-conversion-email',
      startOption: 'current_month',
      subscriptionPlanId: 'plan-growth',
      requestedBy: '22222222-2222-4222-8222-222222222222',
    });

    expect(emailService.sendInvoiceIssued).toHaveBeenCalledWith(
      'billing@acme.test',
      expect.objectContaining({
        companyName: 'Acme Co',
        planName: 'Growth',
      }),
    );
    expect(
      managerRepositories.get(TenantBillingRecord).create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedBy: '22222222-2222-4222-8222-222222222222',
      }),
    );
  });

  it('skips the invoice email silently without delivery config (Plan 30 E2)', async () => {
    const { service } = createService({});
    await expect(
      (service as any).sendInvoiceIssuedNotice(
        'tenant-1',
        { id: 'billing-1', invoiceNo: 'INV-1', amountDue: 100 },
        { planName: 'P', lineDescription: 'L', billingPeriodLabel: 'D' },
      ),
    ).resolves.toBeUndefined();
  });

  it('creates a fresh paid request scheduled at trial expiry without a conversion revision', async () => {
    const { service, managerRepositories } = buildConversionManager();

    const result = await service.createSubscriptionPurchaseRequest('tenant-1', {
      idempotencyKey: 'fresh-after-trial-1',
      startOption: 'after_trial',
      subscriptionPlanId: 'plan-growth',
    });

    expect(result.purchase).toMatchObject({
      startOption: 'after_trial',
      periodStatus: 'upcoming',
    });
    expect(
      'scheduledStartAt' in result.purchase && result.purchase.scheduledStartAt,
    ).toBeTruthy();
    expect(
      managerRepositories.get(TenantBillingRecord).create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          purchaseMode: 'after_trial',
          quotaCarryover: false,
          scheduledStartAt: expect.any(String),
        }),
      }),
    );
    expect(
      managerRepositories.get(TenantSubscriptionPeriodUpgradeRevision).save,
    ).not.toHaveBeenCalled();
    expect(
      managerRepositories.get(SubscriptionPeriodEvent).save,
    ).not.toHaveBeenCalled();
  });

  it('allows an after-trial request despite the trial zero-cost confirm invoice', async () => {
    const now = new Date();
    const trialInvoice = {
      id: 'trial-invoice',
      tenantId: 'tenant-1',
      reviewStatus: 'confirm',
      subscriptionPlanId: 'plan-trial',
      billingPeriodStart: now,
      billingPeriodEnd: yangonMonthEnd(yangonMonthStart(now)),
      amountDue: 0,
      amountPaid: 0,
      metadata: {
        source: 'self_registration',
        purchaseRequestType: 'subscription_period',
        trial: true,
        zeroCost: true,
        selectedPlanId: 'plan-trial',
        idempotencyKey: 'self-registration:tenant-1',
      },
    };
    const { service, managerRepositories } = buildConversionManager({
      billingRecords: [trialInvoice],
    });

    const result = await service.createSubscriptionPurchaseRequest('tenant-1', {
      idempotencyKey: 'after-trial-with-trial-row',
      startOption: 'after_trial',
      subscriptionPlanId: 'plan-growth',
    });

    expect(result.purchase).toMatchObject({
      startOption: 'after_trial',
      periodStatus: 'upcoming',
    });
    expect(
      managerRepositories.get(TenantBillingRecord).create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          purchaseMode: 'after_trial',
        }),
      }),
    );
  });

  it('does not treat the trial invoice as paid current-month coverage for next_month', async () => {
    const now = new Date();
    const trialInvoice = {
      id: 'trial-invoice',
      tenantId: 'tenant-1',
      reviewStatus: 'confirm',
      subscriptionPlanId: 'plan-trial',
      billingPeriodStart: now,
      billingPeriodEnd: yangonMonthEnd(yangonMonthStart(now)),
      amountDue: 0,
      amountPaid: 0,
      metadata: {
        source: 'self_registration',
        purchaseRequestType: 'subscription_period',
        trial: true,
        zeroCost: true,
        selectedPlanId: 'plan-trial',
        idempotencyKey: 'self-registration:tenant-1',
      },
    };
    const { service } = buildConversionManager({
      billingRecords: [trialInvoice],
    });

    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'next-month-trial-only',
        startOption: 'next_month',
        subscriptionPlanId: 'plan-growth',
      }),
    ).rejects.toThrow(
      'Requesting a future month requires an active paid subscription for the current month',
    );
  });

  it('rejects an after-trial request when a current-month trial conversion is open', async () => {
    const { service } = buildConversionManager({
      existingRevision: {
        id: 'revision-existing',
        upgradeStatus: 'requested',
        metadata: { kind: 'trial_conversion' },
      },
    });

    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'fresh-after-open-conversion',
        startOption: 'after_trial',
        subscriptionPlanId: 'plan-growth',
      }),
    ).rejects.toThrow(
      'A trial plan request already exists; cancel or resolve it before choosing another trial purchase path.',
    );
  });

  it('rejects a current-month trial conversion when an after-trial request is open', async () => {
    const { service } = buildConversionManager({
      billingRecords: [
        {
          id: 'after-trial-invoice',
          invoiceStatus: 'issued',
          reviewStatus: 'in_review',
          metadata: {
            purchaseMode: 'after_trial',
            idempotencyKey: 'after-trial-key',
          },
        },
      ],
    });

    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'current-trial-conversion',
        startOption: 'current_month',
        subscriptionPlanId: 'plan-growth',
      }),
    ).rejects.toThrow(
      'A trial plan request already exists; cancel or resolve it before choosing another trial purchase path.',
    );
  });

  it('enforces one conversion per trial period (task 2.11)', async () => {
    const { service } = buildConversionManager({
      existingRevision: {
        id: 'revision-existing',
        upgradeStatus: 'requested',
        metadata: { kind: 'trial_conversion' },
      },
    });

    await expect(
      service.createSubscriptionPurchaseRequest('tenant-1', {
        idempotencyKey: 'trial-conversion-2',
        startOption: 'current_month',
        subscriptionPlanId: 'plan-growth',
      }),
    ).rejects.toThrow(
      'A trial conversion for the current month already exists',
    );
  });
});

describe('TenantService invoice cancellation (Plan 56)', () => {
  function cancelSetup(options: {
    reviewStatus: string;
    proofStatus?: string;
    revisionStatus?: string;
  }) {
    const billingRecord = {
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
    const saved: any[] = [];
    const manager: any = {
      getRepository: jest.fn((entity: any) => {
        if (entity === TenantSubscriptionPeriodUpgradeRevision) {
          return {
            findOne: jest.fn().mockResolvedValue(revision),
            save: jest.fn(async (value) => {
              saved.push(value);
              return value;
            }),
          };
        }
        return {
          save: jest.fn(async (value) => {
            saved.push(value);
            return value;
          }),
          create: jest.fn((value) => value),
        };
      }),
      save: jest.fn(async (_entity: any, value: any) => {
        saved.push(value);
        return value;
      }),
    };
    manager.transaction = jest.fn(async (callback: any) => callback(manager));
    const { service, repositories } = createService({
      billingManager: manager,
    });
    repositories.tenantBillingRecord.findOne = jest
      .fn()
      .mockResolvedValue(
        options.reviewStatus === 'missing' ? null : billingRecord,
      );
    repositories.subscriptionPeriod.findOne = jest.fn().mockResolvedValue(null);
    return { service, billingRecord, revision, saved };
  }

  it('cancelling an upgrade revision also cancels the linked invoice', async () => {
    const revision = {
      id: 'revision-1',
      tenantId: 'tenant-1',
      subscriptionPeriodId: 'period-1',
      billingRecordId: 'billing-1',
      upgradeStatus: 'requested',
    };
    const billingRecord = {
      id: 'billing-1',
      tenantId: 'tenant-1',
      reviewStatus: 'in_review',
      metadata: {},
    };
    const saved: any[] = [];
    const manager: any = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn(async ({ where }: any) =>
          where?.id === 'billing-1' ? billingRecord : revision,
        ),
        save: jest.fn(async (value: any) => {
          saved.push(value);
          return value;
        }),
        create: jest.fn((value) => value),
      })),
    };
    manager.transaction = jest.fn(async (callback: any) => callback(manager));
    const { service } = createService({ billingManager: manager });
    const result = await service.cancelUpgradeRevision(
      'tenant-1',
      'user-1',
      'revision-1',
    );
    expect(result.upgradeStatus).toBe('cancelled');
    expect(billingRecord.reviewStatus).toBe('cancelled');
  });

  it('tenant invoice cancel sets cancelled (not reject)', async () => {
    const { service, billingRecord } = cancelSetup({
      reviewStatus: 'in_review',
      revisionStatus: 'requested',
    });
    await service.cancelSubscriptionBillingRecord(
      'tenant-1',
      'billing-1',
      'user-1',
    );
    expect(billingRecord.reviewStatus).toBe('cancelled');
  });

  it('rejects cancelling an already-cancelled invoice', async () => {
    const { service } = cancelSetup({ reviewStatus: 'cancelled' });
    await expect(
      service.cancelSubscriptionBillingRecord(
        'tenant-1',
        'billing-1',
        'user-1',
      ),
    ).rejects.toThrow('already cancelled');
  });

  it('rejects proof submission on a cancelled invoice', async () => {
    const { service } = cancelSetup({ reviewStatus: 'cancelled' });
    await expect(
      service.submitPaymentProof('tenant-1', 'billing-1', undefined, {
        mediaFileId: 'file-1',
        mediaScanStatus: 'clean',
        paidAmount: 100,
        paidDate: new Date().toISOString(),
        payerNote: null,
      } as any),
    ).rejects.toThrow('was cancelled');
  });
});
