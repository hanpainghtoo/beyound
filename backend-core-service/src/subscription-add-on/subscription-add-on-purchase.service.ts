import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, type EntityManager, type Repository } from 'typeorm';

import { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import { TenantEntitlement } from '../entitlement/entities/tenant-entitlement.entity';
import { TenantSubscriptionPeriod } from '../subscription-period/entities/tenant-subscription-period.entity';
import {
  yangonCalendarDate,
  yangonMonthEnd,
  yangonMonthStart,
} from '../subscription-period/yangon-month.util';
import { SubscriptionAddOnProduct } from './entities/subscription-add-on-product.entity';
import { SubscriptionAddOnProductComponent } from './entities/subscription-add-on-product-component.entity';
import { TenantSubscriptionAddOnPurchase } from './entities/tenant-subscription-add-on-purchase.entity';
import { TenantSubscriptionAddOnComponent } from './entities/tenant-subscription-add-on-component.entity';
import { TenantSubscriptionAddOnPurchaseEvent } from './entities/tenant-subscription-add-on-purchase-event.entity';
import { resolveActivePaidPeriod } from './subscription-add-on-active-period.util';
import { baseLimitForDimension } from '../subscription-period/subscription-entitlement.service';
import { validatePurchaseBillingLinkage } from './subscription-add-on-purchase-billing-linkage.util';
import { AddOnPurchaseResponseDto } from './dto/add-on-purchase-response.dto';
import type { AddOnPurchaseEventType } from './subscription-add-on-purchase.types';

export interface PurchaseActor {
  type: string;
  id?: string | null;
}

export interface PurchaseOptions {
  actor?: PurchaseActor;
  source?: string;
  reason?: string;
  idempotencyKey?: string;
  now?: Date;
  manager?: EntityManager;
}

const DEFAULT_ACTOR: PurchaseActor = { type: 'tenant_user', id: null };

function buildTopUpInvoiceNumber(now: Date, billingRecordId: string): string {
  const datePart = yangonCalendarDate(now)
    .toISOString()
    .slice(0, 10)
    .replaceAll('-', '');
  return `INV-${datePart}-${billingRecordId.replaceAll('-', '').toUpperCase()}`;
}

/**
 * Top-up purchase ledger (Plan 9 Phase 4, tasks 4.2–4.8).
 *
 * - create: server resolves the active paid period, snapshots product
 *   components/price/currency/period-end atomically with a pending purchase.
 * - confirm: platform roles confirm payment against a same-tenant paid billing
 *   record (task 4.1/4.6), grant the bundle exactly once, activate all
 *   components, and never touch subscription periods (no early activation).
 * - cancel: only pending purchases can be cancelled; refunds are out of scope.
 * - expire: idempotent month-end transition used by the scheduler/resolver.
 *
 * Every mutation is idempotent via the purchase/event idempotency key; a retry
 * returns the stored result instead of granting a second bundle.
 */
@Injectable()
export class SubscriptionAddOnPurchaseService {
  constructor(
    @InjectRepository(TenantSubscriptionAddOnPurchase)
    private purchaseRepository: Repository<TenantSubscriptionAddOnPurchase>,
    @InjectRepository(TenantSubscriptionAddOnComponent)
    private componentRepository: Repository<TenantSubscriptionAddOnComponent>,
    @InjectRepository(TenantSubscriptionAddOnPurchaseEvent)
    private eventRepository: Repository<TenantSubscriptionAddOnPurchaseEvent>,
    @InjectRepository(TenantSubscriptionPeriod)
    private periodRepository: Repository<TenantSubscriptionPeriod>,
    @InjectRepository(TenantBillingRecord)
    private billingRecordRepository: Repository<TenantBillingRecord>,
    @InjectRepository(TenantEntitlement)
    private entitlementRepository: Repository<TenantEntitlement>,
    @InjectRepository(SubscriptionAddOnProduct)
    private productRepository: Repository<SubscriptionAddOnProduct>,
    @InjectRepository(SubscriptionAddOnProductComponent)
    private productComponentRepository: Repository<SubscriptionAddOnProductComponent>,
    private dataSource: DataSource,
  ) {}

  /**
   * Create a pending top-up bundle purchase against the tenant's resolved
   * active paid period (tasks 4.3/4.4/4.5). Client-supplied target periods
   * are rejected unless they match the server resolution.
   */
  async createPurchase(
    tenantId: string,
    input: {
      productId: string;
      requestedPeriodId?: string | null;
      billingRecordId?: string | null;
      idempotencyKey?: string;
      now?: Date;
    },
    options: PurchaseOptions = {},
  ): Promise<AddOnPurchaseResponseDto> {
    // The request-level key (input) is the authoritative purchase idempotency;
    // options carries it from the controller for event persistence.
    const idempotencyKey = input.idempotencyKey ?? options.idempotencyKey;
    const replayed = await this.replayOrNull(
      idempotencyKey,
      undefined,
      tenantId,
      'add_on_purchase_created',
    );
    if (replayed) return replayed;

    const product = await this.productRepository.findOne({
      where: { id: input.productId },
    });
    if (!product) {
      throw new NotFoundException('Top-up product not found');
    }
    if (product.status !== 'active') {
      throw new ConflictException(
        'Only published (active) top-up products can be purchased.',
      );
    }

    const [periods, entitlement] = await Promise.all([
      this.periodRepository.find({ where: { tenantId } }),
      this.entitlementRepository.findOne({ where: { tenantId } }),
    ]);
    const resolution = resolveActivePaidPeriod({
      periods,
      entitlement,
      requestedPeriodId: input.requestedPeriodId,
      now: input.now,
    });
    if (!resolution.ok) {
      const code =
        resolution.code === 'unpaid_active_period'
          ? 'SUBSCRIPTION_PAYMENT_REQUIRED'
          : resolution.code === 'period_mismatch'
            ? 'TOPUP_NOT_AVAILABLE_FOR_PERIOD'
            : resolution.code === 'trial_period'
              ? 'TOPUP_NOT_AVAILABLE_FOR_TRIAL'
              : resolution.code === 'admin_approval_pending'
                ? 'SUBSCRIPTION_PERIOD_AWAITING_ACTIVATION'
                : 'SUBSCRIPTION_PERIOD_NOT_ACTIVE';
      throw new ConflictException({
        code,
        message: resolution.detail,
        requestedPeriodId: input.requestedPeriodId ?? null,
      });
    }
    const period = resolution.period;

    const billingRecord = await this.resolveBillingRecord(
      tenantId,
      input.billingRecordId,
    );
    if (billingRecord) {
      const metadata = billingRecord.metadata || {};
      if (metadata.purchaseRequestType !== 'top_up') {
        throw new ConflictException(
          'The supplied billing record is not a top-up invoice.',
        );
      }
      if (metadata.productId !== product.id) {
        throw new ConflictException(
          'The supplied billing record does not identify the requested top-up product.',
        );
      }
      if (metadata.subscriptionPeriodId !== period.id) {
        throw new ConflictException(
          'The supplied billing record does not identify the requested subscription period.',
        );
      }
      if (Number(billingRecord.amountDue || 0) !== Number(product.price || 0)) {
        throw new ConflictException(
          'The supplied billing record amount does not match the top-up product price.',
        );
      }
      if (billingRecord.paymentStatus === 'paid') {
        throw new ConflictException(
          'A paid billing record cannot be attached to a new top-up purchase; create a fresh top-up invoice.',
        );
      }
      const linkage = validatePurchaseBillingLinkage({
        purchase: {
          id: `pending-top-up:${billingRecord.id}`,
          tenantId,
          billingRecordId: billingRecord.id,
          paymentStatus: 'pending',
          effectiveAt: yangonMonthStart(period.periodStartAt as Date),
          expiresAt: yangonMonthEnd(period.periodStartAt as Date),
        },
        billingRecord,
      });
      if (!linkage.valid) {
        throw new ConflictException(
          `The supplied billing record does not cover the target period: ${linkage.issues
            .map((issue) => issue.detail)
            .join(' ')}`,
        );
      }
    }
    const productComponents = await this.productComponentRepository.find({
      where: { productId: product.id },
      order: { displayOrder: 'ASC' },
    });
    if (productComponents.length === 0) {
      throw new ConflictException(
        'The top-up product has no components and cannot be purchased.',
      );
    }

    // Analysis 3.2 / task 5.13: a top-up may never turn an unlimited base
    // into a finite quota, so an unnecessary top-up for an unlimited
    // dimension is rejected before payment. Legacy snapshots that never
    // captured a dimension (undefined) are treated as finite-unknown and
    // allowed, so older periods are never blocked retroactively. A legacy
    // combined snapshot (finite `messageLimit` with null directional limits)
    // is capped, not unlimited, so message top-ups remain purchasable.
    const unlimitedDimension = productComponents.find((component) => {
      if (
        component.componentType !== 'inbound_messages' &&
        component.componentType !== 'outbound_messages'
      ) {
        return (
          baseLimitForDimension(
            period.quotaSnapshot,
            component.componentType,
          ) === null
        );
      }
      const directionalBase = baseLimitForDimension(
        period.quotaSnapshot,
        component.componentType,
      );
      const legacyCombinedCap = period.quotaSnapshot?.messageLimit;
      return (
        directionalBase === null &&
        (legacyCombinedCap === null || legacyCombinedCap === undefined)
      );
    });
    if (unlimitedDimension) {
      throw new ConflictException(
        `Top-up component '${unlimitedDimension.componentType}' targets an unlimited quota dimension (the base plan is unlimited) and is not needed.`,
      );
    }

    const actor = options.actor || DEFAULT_ACTOR;
    const purchase = await this.dataSource.transaction(async (manager) => {
      const billingRepository = manager.getRepository(TenantBillingRecord);
      const purchaseManagerRepository = manager.getRepository(
        TenantSubscriptionAddOnPurchase,
      );
      let savedBillingRecord = billingRecord;

      if (savedBillingRecord) {
        // Lock an explicitly supplied invoice before checking its one-to-one
        // purchase link. This serializes concurrent requests for the same
        // invoice and turns reuse into a deterministic conflict.
        const lockedBillingRecord = await billingRepository.findOne({
          where: { id: savedBillingRecord.id, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!lockedBillingRecord) {
          throw new NotFoundException(
            'Billing record not found for this tenant.',
          );
        }
        if (lockedBillingRecord.paymentStatus === 'paid') {
          throw new ConflictException(
            'A paid billing record cannot be attached to a new top-up purchase; create a fresh top-up invoice.',
          );
        }
        const existingPurchase = await purchaseManagerRepository.findOne({
          where: { billingRecordId: lockedBillingRecord.id },
        });
        if (existingPurchase) {
          throw new ConflictException(
            `Billing record ${lockedBillingRecord.id} is already linked to top-up purchase ${existingPurchase.id}.`,
          );
        }
        savedBillingRecord = lockedBillingRecord;
      }

      // A tenant top-up request is also a billing request. Create the unpaid
      // invoice in the same transaction as the pending purchase so the
      // Workspace billing history and the top-up ledger cannot diverge.
      if (!savedBillingRecord) {
        savedBillingRecord = await billingRepository.save(
          billingRepository.create({
            tenantId,
            subscriptionPlanId: null,
            invoiceNumber: null,
            billingPeriodStart: yangonCalendarDate(
              (period.monthStartAt || period.periodStartAt) as Date,
            ),
            billingPeriodEnd: yangonCalendarDate(
              new Date(
                ((period.monthEndAt || period.periodEndAt) as Date).getTime() -
                  1,
              ),
            ),
            invoiceStatus: 'issued',
            paymentStatus: 'unpaid',
            amountDue: Number(product.price || 0),
            amountPaid: 0,
            currency: product.currency || 'MMK',
            dueDate: null,
            paidAt: null,
            notes: 'Top-up purchase request awaiting payment confirmation.',
            metadata: {
              source: 'tenant_add_on_purchase_request',
              purchaseRequestType: 'top_up',
              productId: product.id,
              productCode: product.code,
              productName: product.name,
              subscriptionPeriodId: period.id,
              idempotencyKey: idempotencyKey ?? null,
              fullMonthlyPrice: false,
              proration: false,
            },
          }),
        );
        if (!savedBillingRecord.invoiceNumber) {
          savedBillingRecord.invoiceNumber = buildTopUpInvoiceNumber(
            input.now || new Date(),
            savedBillingRecord.id,
          );
          savedBillingRecord = await billingRepository.save(savedBillingRecord);
        }
      }

      const savedPurchase = await manager
        .getRepository(TenantSubscriptionAddOnPurchase)
        .save(
          manager.getRepository(TenantSubscriptionAddOnPurchase).create({
            tenantId,
            subscriptionPeriodId: period.id,
            productId: product.id,
            billingRecordId: savedBillingRecord?.id ?? null,
            purchasePrice: Number(product.price || 0),
            currency: product.currency || 'MMK',
            paymentStatus: 'pending',
            purchaseStatus: 'pending',
            effectiveAt: null,
            expiresAt: period.periodEndAt as Date,
            idempotencyKey: idempotencyKey ?? null,
            metadata: {
              productCode: product.code,
              productName: product.name,
              periodMonthStart: period.monthStartAt?.toISOString() ?? null,
              periodMonthEnd: period.monthEndAt?.toISOString() ?? null,
              requestedPeriodId: input.requestedPeriodId ?? null,
              billingRecordId: savedBillingRecord?.id ?? null,
            },
          }),
        );

      if (savedBillingRecord && !billingRecord) {
        savedBillingRecord.metadata = {
          ...(savedBillingRecord.metadata || {}),
          addOnPurchaseId: savedPurchase.id,
        };
        await billingRepository.save(savedBillingRecord);
      }

      const components = productComponents.map((component) =>
        manager.getRepository(TenantSubscriptionAddOnComponent).create({
          purchaseId: savedPurchase.id,
          componentType: component.componentType,
          quantity: component.quantity,
          unit: component.unit,
          expiresAt: period.periodEndAt as Date,
          componentStatus: 'pending',
        }),
      );
      const savedComponents = await manager
        .getRepository(TenantSubscriptionAddOnComponent)
        .save(components);

      const result = this.toResponse(savedPurchase, savedComponents, period);
      await this.writeEvent(manager, {
        purchaseId: savedPurchase.id,
        tenantId,
        eventType: 'add_on_purchase_created',
        previousStatus: null,
        newStatus: 'pending',
        actor,
        options: {
          ...options,
          idempotencyKey: idempotencyKey ?? undefined,
        },

        reason: options.reason || 'Top-up bundle purchase created',
        metadata: {
          result,
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          purchasePrice: Number(product.price || 0),
          periodId: period.id,
        },
      });
      return savedPurchase;
    });

    return this.getPurchaseForTenant(tenantId, purchase.id);
  }

  /**
   * Confirm a purchase's payment (tasks 4.1/4.6). Reuses the platform payment
   * confirmation permission model: the purchase must reference a billing
   * record that belongs to the same tenant and is already paid. Grants the
   * bundle exactly once (idempotent) and never activates any subscription
   * period — prepaid months stay queued.
   */
  async confirmPurchasePayment(
    tenantId: string,
    purchaseId: string,
    options: PurchaseOptions = {},
  ): Promise<AddOnPurchaseResponseDto> {
    const key = options.idempotencyKey ?? `confirm:${purchaseId}`;
    const replayed = await this.replayOrNull(
      key,
      options.manager,
      tenantId,
      'add_on_payment_confirmed',
    );
    if (replayed) return replayed;

    const purchaseRepository =
      options.manager?.getRepository(TenantSubscriptionAddOnPurchase) ||
      this.purchaseRepository;
    const purchase = await purchaseRepository.findOne({
      where: { id: purchaseId, tenantId },
    });
    if (!purchase) {
      throw new NotFoundException('Top-up purchase not found');
    }

    const confirmationNow = options.now || new Date();
    const actor = options.actor || { type: 'platform_admin', id: null };
    const runTransaction = <T>(
      callback: (manager: EntityManager) => Promise<T>,
    ): Promise<T> =>
      options.manager
        ? callback(options.manager)
        : this.dataSource.transaction(callback);
    const purchaseResult = await runTransaction(async (manager) => {
      const lockedPurchase = await manager
        .getRepository(TenantSubscriptionAddOnPurchase)
        .findOne({
          where: { id: purchaseId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!lockedPurchase) {
        throw new NotFoundException('Top-up purchase not found');
      }
      if (
        lockedPurchase.paymentStatus !== 'pending' ||
        lockedPurchase.purchaseStatus !== 'pending'
      ) {
        if (
          lockedPurchase.purchaseStatus === 'cancelled' ||
          lockedPurchase.purchaseStatus === 'expired'
        ) {
          throw new ConflictException(
            `Purchase is '${lockedPurchase.purchaseStatus}'; only pending purchases can be confirmed.`,
          );
        }
        const concurrentReplay = await this.replayOrNull(
          key,
          manager,
          tenantId,
          'add_on_payment_confirmed',
        );
        if (concurrentReplay) return concurrentReplay;
        throw new ConflictException(
          'Top-up purchase was already confirmed by another payment operation.',
        );
      }
      if (confirmationNow.getTime() >= lockedPurchase.expiresAt.getTime()) {
        throw new ConflictException(
          `Purchase ${purchaseId} expired at ${lockedPurchase.expiresAt.toISOString()} before payment confirmation; create a new purchase for the current month.`,
        );
      }

      const billingRecord = lockedPurchase.billingRecordId
        ? await manager.getRepository(TenantBillingRecord).findOne({
            where: {
              id: lockedPurchase.billingRecordId,
              tenantId,
            },
            lock: { mode: 'pessimistic_write' },
          })
        : null;
      if (lockedPurchase.billingRecordId && !billingRecord) {
        throw new NotFoundException(
          'Billing record not found for this tenant (payment evidence must belong to the same tenant).',
        );
      }
      // A referenced billing record must itself be confirmed paid before the
      // bundle is granted — payment confirmation may not run on unpaid evidence.
      if (
        lockedPurchase.billingRecordId &&
        billingRecord?.paymentStatus !== 'paid'
      ) {
        throw new ConflictException(
          `Payment evidence for purchase ${purchaseId} is not confirmed (billing record payment status '${billingRecord?.paymentStatus ?? 'missing'}').`,
        );
      }
      const linkage = validatePurchaseBillingLinkage({
        purchase: {
          ...lockedPurchase,
          effectiveAt: confirmationNow,
          expiresAt: lockedPurchase.expiresAt,
        },
        billingRecord,
      });
      if (!linkage.valid) {
        throw new ConflictException(
          `Payment evidence invalid for purchase ${purchaseId}: ${linkage.issues
            .map((issue) => issue.detail)
            .join(' ')}`,
        );
      }

      lockedPurchase.paymentStatus = 'paid';
      lockedPurchase.purchaseStatus = 'active';
      lockedPurchase.effectiveAt = confirmationNow;
      const savedPurchase = await manager
        .getRepository(TenantSubscriptionAddOnPurchase)
        .save(lockedPurchase);

      const components = await manager
        .getRepository(TenantSubscriptionAddOnComponent)
        .find({ where: { purchaseId } });
      for (const component of components) {
        component.componentStatus = 'active';
      }
      await manager
        .getRepository(TenantSubscriptionAddOnComponent)
        .save(components);
      const period = await manager
        .getRepository(TenantSubscriptionPeriod)
        .findOne({ where: { id: savedPurchase.subscriptionPeriodId } });
      const result = this.toResponse(
        savedPurchase,
        components,
        period ?? undefined,
      );
      await this.writeEvent(manager, {
        purchaseId,
        tenantId,
        eventType: 'add_on_payment_confirmed',
        previousStatus: 'pending',
        newStatus: 'paid',
        actor,
        options: { ...options, idempotencyKey: key },
        reason: options.reason || 'Top-up payment confirmed by operator',
        metadata: { result, billingRecordId: billingRecord?.id ?? null },
      });
      await this.writeEvent(manager, {
        purchaseId,
        tenantId,
        eventType: 'add_on_activated',
        previousStatus: 'pending',
        newStatus: 'active',
        actor,
        options: { ...options, idempotencyKey: `${key}:activate` },
        reason:
          options.reason || 'Top-up components activated for active period',
        metadata: { result },
      });
      return result;
    });

    return purchaseResult;
  }

  /** Confirm the pending purchase attached to one paid top-up invoice. */
  async confirmPurchaseForBillingRecord(
    tenantId: string,
    billingRecordId: string,
    options: PurchaseOptions = {},
  ): Promise<AddOnPurchaseResponseDto | null> {
    const purchaseRepository =
      options.manager?.getRepository(TenantSubscriptionAddOnPurchase) ||
      this.purchaseRepository;
    const purchase = await purchaseRepository.findOne({
      where: { tenantId, billingRecordId },
    });
    if (!purchase) return null;
    if (
      purchase.paymentStatus === 'paid' &&
      purchase.purchaseStatus === 'active'
    ) {
      // This is an idempotent retry after payment was already granted. Read
      // through the active transaction manager when one is supplied so a
      // caller never observes a partially committed transaction state.
      if (options.manager) {
        const [components, period] = await Promise.all([
          options.manager
            .getRepository(TenantSubscriptionAddOnComponent)
            .find({ where: { purchaseId: purchase.id } }),
          options.manager
            .getRepository(TenantSubscriptionPeriod)
            .findOne({ where: { id: purchase.subscriptionPeriodId } }),
        ]);
        return this.toResponse(purchase, components, period ?? undefined);
      }
      return this.getPurchaseById(purchase.id);
    }
    return this.confirmPurchasePayment(tenantId, purchase.id, options);
  }

  async cancelPurchase(
    tenantId: string,
    purchaseId: string,
    options: PurchaseOptions = {},
  ): Promise<AddOnPurchaseResponseDto> {
    const key = options.idempotencyKey ?? `cancel:${purchaseId}`;
    const purchase = await this.purchaseRepository.findOne({
      where: { id: purchaseId, tenantId },
    });
    if (!purchase) {
      throw new NotFoundException('Top-up purchase not found');
    }
    const replayed = await this.replayOrNull(
      key,
      undefined,
      tenantId,
      'add_on_cancelled',
    );
    if (replayed) return replayed;

    if (purchase.paymentStatus === 'paid') {
      throw new ConflictException(
        'Paid purchases cannot be cancelled; refunds are not supported in this release.',
      );
    }
    if (purchase.purchaseStatus !== 'pending') {
      throw new ConflictException(
        `Only pending purchases can be cancelled (status is '${purchase.purchaseStatus}').`,
      );
    }

    const actor = options.actor || DEFAULT_ACTOR;
    const result = await this.dataSource.transaction(async (manager) => {
      const lockedPurchase = await manager
        .getRepository(TenantSubscriptionAddOnPurchase)
        .findOne({
          where: { id: purchaseId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!lockedPurchase) {
        throw new NotFoundException('Top-up purchase not found');
      }
      if (lockedPurchase.paymentStatus === 'paid') {
        throw new ConflictException(
          'Paid purchases cannot be cancelled; refunds are not supported in this release.',
        );
      }
      if (lockedPurchase.purchaseStatus !== 'pending') {
        throw new ConflictException(
          `Only pending purchases can be cancelled (status is '${lockedPurchase.purchaseStatus}').`,
        );
      }
      lockedPurchase.purchaseStatus = 'cancelled';
      const savedPurchase = await manager
        .getRepository(TenantSubscriptionAddOnPurchase)
        .save(lockedPurchase);
      const components = await manager
        .getRepository(TenantSubscriptionAddOnComponent)
        .find({ where: { purchaseId } });
      const period = await manager
        .getRepository(TenantSubscriptionPeriod)
        .findOne({ where: { id: savedPurchase.subscriptionPeriodId } });
      const response = this.toResponse(
        savedPurchase,
        components,
        period ?? undefined,
      );
      await this.writeEvent(manager, {
        purchaseId,
        tenantId,
        eventType: 'add_on_cancelled',
        previousStatus: 'pending',
        newStatus: 'cancelled',
        actor,
        options: { ...options, idempotencyKey: key },
        reason: options.reason || 'Pending top-up purchase cancelled',
        metadata: { result: response },
      });
      return response;
    });
    return result;
  }

  /** Idempotent month-end expiry used by the scheduler/resolver (task 4.8). */
  async expirePurchase(
    purchaseId: string,
    options: PurchaseOptions = {},
  ): Promise<AddOnPurchaseResponseDto> {
    const key = options.idempotencyKey ?? `expire:${purchaseId}`;

    const purchase = await this.purchaseRepository.findOne({
      where: { id: purchaseId },
    });
    if (!purchase) {
      throw new NotFoundException('Top-up purchase not found');
    }
    const replayed = await this.replayOrNull(
      key,
      undefined,
      purchase.tenantId,
      'add_on_expired',
    );
    if (replayed) return replayed;
    if (purchase.purchaseStatus !== 'active') {
      return this.getPurchaseById(purchaseId);
    }

    const actor = options.actor || { type: 'system', id: 'purchase-expirer' };
    const result = await this.dataSource.transaction(async (manager) => {
      const lockedPurchase = await manager
        .getRepository(TenantSubscriptionAddOnPurchase)
        .findOne({
          where: { id: purchaseId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!lockedPurchase) {
        throw new NotFoundException('Top-up purchase not found');
      }
      if (lockedPurchase.purchaseStatus !== 'active') {
        const [components, period] = await Promise.all([
          manager
            .getRepository(TenantSubscriptionAddOnComponent)
            .find({ where: { purchaseId } }),
          manager
            .getRepository(TenantSubscriptionPeriod)
            .findOne({ where: { id: lockedPurchase.subscriptionPeriodId } }),
        ]);
        return this.toResponse(lockedPurchase, components, period ?? undefined);
      }
      lockedPurchase.purchaseStatus = 'expired';
      const savedPurchase = await manager
        .getRepository(TenantSubscriptionAddOnPurchase)
        .save(lockedPurchase);
      const components = await manager
        .getRepository(TenantSubscriptionAddOnComponent)
        .find({ where: { purchaseId } });
      for (const component of components) {
        component.componentStatus = 'expired';
      }
      await manager
        .getRepository(TenantSubscriptionAddOnComponent)
        .save(components);
      const period = await manager
        .getRepository(TenantSubscriptionPeriod)
        .findOne({ where: { id: savedPurchase.subscriptionPeriodId } });
      const response = this.toResponse(
        savedPurchase,
        components,
        period ?? undefined,
      );
      await this.writeEvent(manager, {
        purchaseId,
        tenantId: lockedPurchase.tenantId,
        eventType: 'add_on_expired',
        previousStatus: 'active',
        newStatus: 'expired',
        actor,
        options: { ...options, idempotencyKey: key },
        reason: options.reason || 'Top-up expired at the target period end',
        metadata: { result: response },
      });
      return response;
    });
    return result;
  }

  async getPurchaseForTenant(
    tenantId: string,
    purchaseId: string,
  ): Promise<AddOnPurchaseResponseDto> {
    const purchase = await this.purchaseRepository.findOne({
      where: { id: purchaseId, tenantId },
    });
    if (!purchase) {
      throw new NotFoundException('Top-up purchase not found');
    }
    return this.getPurchaseById(purchaseId);
  }

  async listPurchasesForTenant(
    tenantId: string,
    activeOnly = false,
  ): Promise<AddOnPurchaseResponseDto[]> {
    const where: any = { tenantId };
    if (activeOnly) {
      where.purchaseStatus = In(['active', 'pending']);
    }
    const purchases = await this.purchaseRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
    if (activeOnly) {
      const now = Date.now();
      return this.toResponses(
        purchases.filter(
          (p) => !p.expiresAt || p.expiresAt.getTime() > now,
        ),
      );
    }
    return this.toResponses(purchases);
  }

  async getPurchaseById(purchaseId: string): Promise<AddOnPurchaseResponseDto> {
    const purchase = await this.purchaseRepository.findOne({
      where: { id: purchaseId },
    });
    if (!purchase) {
      throw new NotFoundException('Top-up purchase not found');
    }
    const [components, period] = await Promise.all([
      this.componentRepository.find({
        where: { purchaseId },
        order: { createdAt: 'ASC' },
      }),
      this.periodRepository.findOne({
        where: { id: purchase.subscriptionPeriodId },
      }),
    ]);
    return this.toResponse(purchase, components, period ?? undefined);
  }

  /** Operator view: all purchases, optionally filtered by tenant. */
  async listPurchasesForOperator(
    tenantId?: string,
  ): Promise<AddOnPurchaseResponseDto[]> {
    const purchases = tenantId
      ? await this.purchaseRepository.find({
          where: { tenantId },
          order: { createdAt: 'DESC' },
        })
      : await this.purchaseRepository.find({ order: { createdAt: 'DESC' } });
    return this.toResponses(purchases);
  }

  /** List active (unexpired, paid) purchases for the Phase 5 resolver. */
  async listActivePurchasesForPeriod(
    tenantId: string,
    periodId: string,
    now = new Date(),
  ): Promise<AddOnPurchaseResponseDto[]> {
    const purchases = await this.purchaseRepository.find({
      where: { tenantId, subscriptionPeriodId: periodId },
      order: { createdAt: 'ASC' },
    });
    const active = purchases.filter(
      (purchase) =>
        purchase.purchaseStatus === 'active' &&
        purchase.paymentStatus === 'paid' &&
        now.getTime() < purchase.expiresAt.getTime(),
    );
    return this.toResponses(active);
  }

  private async toResponses(
    purchases: TenantSubscriptionAddOnPurchase[],
  ): Promise<AddOnPurchaseResponseDto[]> {
    if (purchases.length === 0) return [];
    const purchaseIds = purchases.map((p) => p.id);
    const periodIds = Array.from(
      new Set(purchases.map((p) => p.subscriptionPeriodId)),
    );
    const periods = await this.periodRepository.find({
      where: periodIds.map((id) => ({ id })),
    });
    const periodById = new Map(periods.map((period) => [period.id, period]));
    // Load components only for the requested purchases (never a full scan).
    const allComponents = await this.componentRepository.find({
      where: purchaseIds.map((id) => ({ purchaseId: id })),
      order: { createdAt: 'ASC' },
    });
    const byPurchase = new Map<string, TenantSubscriptionAddOnComponent[]>();
    for (const component of allComponents) {
      const list = byPurchase.get(component.purchaseId) || [];
      list.push(component);
      byPurchase.set(component.purchaseId, list);
    }
    return purchases.map((purchase) =>
      this.toResponse(
        purchase,
        byPurchase.get(purchase.id) || [],
        periodById.get(purchase.subscriptionPeriodId),
      ),
    );
  }

  private toResponse(
    purchase: TenantSubscriptionAddOnPurchase,
    components: TenantSubscriptionAddOnComponent[],
    period?: TenantSubscriptionPeriod,
  ): AddOnPurchaseResponseDto {
    return {
      id: purchase.id,
      tenantId: purchase.tenantId,
      subscriptionPeriodId: purchase.subscriptionPeriodId,
      productId: purchase.productId,
      billingRecordId: purchase.billingRecordId,
      productCode: (purchase.metadata?.productCode as string) ?? null,
      productName: (purchase.metadata?.productName as string) ?? null,
      purchasePrice: Number(purchase.purchasePrice || 0),
      currency: purchase.currency,
      paymentStatus: purchase.paymentStatus,
      purchaseStatus: purchase.purchaseStatus,
      effectiveAt: purchase.effectiveAt,
      expiresAt: purchase.expiresAt,
      targetPeriod: period
        ? {
            monthStartAt: period.monthStartAt,
            monthEndAt: period.monthEndAt,
            periodStartAt: period.periodStartAt,
            periodEndAt: period.periodEndAt,
          }
        : null,
      components: components.map((component) => ({
        id: component.id,
        componentType: component.componentType,
        quantity: component.quantity,
        unit: component.unit,
        expiresAt: component.expiresAt,
        componentStatus: component.componentStatus,
      })),
      metadata: purchase.metadata || {},
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt,
    };
  }

  private async resolveBillingRecord(
    tenantId: string,
    billingRecordId?: string | null,
    manager?: EntityManager,
  ): Promise<TenantBillingRecord | null> {
    if (!billingRecordId) return null;
    const repository =
      manager?.getRepository(TenantBillingRecord) ||
      this.billingRecordRepository;
    const billingRecord = await repository.findOne({
      where: { id: billingRecordId, tenantId },
    });
    if (!billingRecord) {
      throw new NotFoundException(
        'Billing record not found for this tenant (payment evidence must belong to the same tenant).',
      );
    }
    return billingRecord;
  }

  private async writeEvent(
    manager: EntityManager,
    input: {
      purchaseId: string;
      tenantId: string;
      eventType: AddOnPurchaseEventType;
      previousStatus: string | null;
      newStatus: string | null;
      actor: PurchaseActor;
      options: PurchaseOptions;
      reason: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<void> {
    await manager.getRepository(TenantSubscriptionAddOnPurchaseEvent).save(
      manager.getRepository(TenantSubscriptionAddOnPurchaseEvent).create({
        purchaseId: input.purchaseId,
        tenantId: input.tenantId,
        eventType: input.eventType,
        previousStatus: input.previousStatus,
        newStatus: input.newStatus,
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        source: input.options.source || 'subscription-add-on-purchase',
        reason: input.reason,
        idempotencyKey: input.options.idempotencyKey ?? null,
        metadata: input.metadata,
      }),
    );
  }

  /**
   * Return the stored result of a previous mutation for the same idempotency
   * key, or null for a fresh mutation. Replays are pure reads and never re-run
   * guards or writes, so a retry returns the original result unchanged.
   */
  private async replayOrNull(
    idempotencyKey?: string,
    manager?: EntityManager,
    tenantId?: string,
    eventType?: AddOnPurchaseEventType,
  ): Promise<AddOnPurchaseResponseDto | null> {
    if (!idempotencyKey) return null;
    const eventRepository =
      manager?.getRepository(TenantSubscriptionAddOnPurchaseEvent) ||
      this.eventRepository;
    const existingEvent = await eventRepository.findOne({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(eventType ? { eventType } : {}),
        idempotencyKey,
      },
    });
    return (
      (existingEvent?.metadata?.result as AddOnPurchaseResponseDto) ?? null
    );
  }
}
