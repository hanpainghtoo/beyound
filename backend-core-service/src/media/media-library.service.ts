/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- Legacy media library request helper returns file-storage JSON contracts; this task only changes internal auth headers. */
import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  NotFoundException,
  Inject,
  Injectable,
  Optional,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  serviceAuthHeaders,
} from '@zayos/internal-service-auth';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { CreateMediaUploadDto } from './dto/create-media-upload.dto';
import type { CreateOrderPaymentProofUploadDto } from './dto/create-order-payment-proof-upload.dto';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { SubscriptionEntitlementService } from '../subscription-period/subscription-entitlement.service';
import { isPeriodScopedEnforcementEnabled } from '../subscription-period/subscription-entitlement-flag.util';
import {
  MissingActivePeriodError,
  type ResolvedSubscriptionEntitlement,
} from '../subscription-period/subscription-entitlement.types';
import { resolveStorageCapacity } from './storage-capacity.util';
import { resolvePublicBaseUrl } from '../config/public-base-url';
import { Order } from '../order/entities/order.entity';
import { TenantPaymentMethod } from '../payment/entities/payment-method.entity';
import {
  PAYMENT_IMAGE_CONTENT_TYPES,
  PAYMENT_IMAGE_MAX_BYTES,
  PAYMENT_IMAGE_PURPOSE,
  PaymentImageUploadDto,
} from '../payment/dto/payment-image-upload.dto';

type StorageListResponse = {
  data?: Array<{ sizeBytes?: number; purpose?: string }>;
  hasNext?: boolean;
};

const BYTES_PER_GB = 1024 * 1024 * 1024;
export const PLATFORM_MEDIA_SCOPE = 'platform';
export const PLATFORM_BILLING_ACCOUNT_FILE_PURPOSE = 'platform-billing-account';
export const PUBLIC_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const PUBLIC_BILLING_ACCOUNTS_CACHE_MAX_AGE_SECONDS = 5 * 60;
export const PUBLIC_BILLING_ACCOUNTS_CACHE_CONTROL = `public, max-age=${PUBLIC_BILLING_ACCOUNTS_CACHE_MAX_AGE_SECONDS}`;

/**
 * `MissingActivePeriodError` is a plain `Error` carrying a stable `code` but no
 * HTTP status, so an unhandled one escapes as a raw 500 while every other
 * caller answers with a designed 409. This mirrors the mapping tenant.controller
 * applies to usage-summary, so a client can branch on the same codes no matter
 * which surface refused the request.
 */
const missingPeriodCodeMap: Record<string, string> = {
  PERIOD_PAYMENT_NOT_CONFIRMED: 'SUBSCRIPTION_PAYMENT_REQUIRED',
  PERIOD_AWAITING_ADMIN_ACTIVATION: 'SUBSCRIPTION_PERIOD_AWAITING_ACTIVATION',
  TRIAL_EXPIRED: 'TRIAL_EXPIRED',
};

@Injectable()
export class MediaLibraryService {
  @Inject(SubscriptionEntitlementService)
  @Optional()
  private readonly subscriptionEntitlementService?: SubscriptionEntitlementService;

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(SubscriptionPlan)
    private readonly subscriptionPlanRepository: Repository<SubscriptionPlan>,
    @InjectRepository(Order)
    @Optional()
    private readonly orderRepository?: Repository<Order>,
    @InjectRepository(TenantPaymentMethod)
    @Optional()
    private readonly paymentMethodRepository?: Repository<TenantPaymentMethod>,
  ) {}

  async listFiles(tenantId: string, query: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    for (const key of ['search', 'purpose', 'contentType', 'page', 'limit']) {
      const value = query[key];
      if (value) params.set(key, value);
    }
    const suffix = params.size ? `?${params.toString()}` : '';
    const response = (await this.request(
      `/files${suffix}`,
      tenantId,
    )) as StorageListResponse;
    return response;
  }

  async createUpload(
    tenantId: string,
    userId: string,
    input: CreateMediaUploadDto,
  ) {
    // Workspace logos are tenant identity assets and must remain uploadable
    // even when the tenant has no current operational period or is over its
    // storage quota (mirrors the billing-proof exemption). Their bytes still
    // count toward usage via the best-effort snapshot refresh below.
    if (input.purpose === 'workspace-logo') {
      const response = await this.request('/files/uploads', tenantId, {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          ownerId: userId,
          purpose: 'workspace-logo',
          storageCapacity: { periodId: null, limitGb: null },
        }),
      });
      await this.refreshStorageCapacitySnapshot(tenantId);
      return response;
    }

    const capacity = await this.assertStorageLimit(tenantId, input.sizeBytes);
    return this.request('/files/uploads', tenantId, {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        ownerId: userId,
        storageCapacity: {
          periodId: capacity.periodId,
          limitGb: capacity.limitGb,
        },
      }),
    });
  }

  createOrderPaymentProofUpload(
    tenantId: string,
    userId: string,
    input: CreateOrderPaymentProofUploadDto,
  ) {
    return this.createUpload(tenantId, userId, {
      ...input,
      purpose: 'order-payment-proof',
    });
  }

  createPaymentMethodImageUpload(
    tenantId: string,
    userId: string,
    input: PaymentImageUploadDto,
  ) {
    if (
      !PAYMENT_IMAGE_CONTENT_TYPES.includes(
        input.contentType as (typeof PAYMENT_IMAGE_CONTENT_TYPES)[number],
      )
    ) {
      throw new BadRequestException(
        'Payment method images must be PNG, JPEG, or WebP',
      );
    }
    if (input.sizeBytes > PAYMENT_IMAGE_MAX_BYTES) {
      throw new PayloadTooLargeException(
        'Payment method images must be 2 MiB or smaller',
      );
    }
    return this.createUpload(tenantId, userId, {
      ...input,
      purpose: PAYMENT_IMAGE_PURPOSE,
      metadata: { paymentImage: true },
    });
  }

  async getPaymentMethodImage(tenantId: string, fileId: string) {
    const file = (await this.request(
      `/files/${encodeURIComponent(fileId)}`,
      tenantId,
    )) as {
      id?: string;
      tenantId?: string;
      purpose?: string;
      contentType?: string;
      sizeBytes?: number;
      status?: string;
    };
    if (
      !file ||
      file.id !== fileId ||
      file.tenantId !== tenantId ||
      file.purpose !== PAYMENT_IMAGE_PURPOSE ||
      !PAYMENT_IMAGE_CONTENT_TYPES.includes(
        file.contentType as (typeof PAYMENT_IMAGE_CONTENT_TYPES)[number],
      ) ||
      !file.sizeBytes ||
      file.sizeBytes > PAYMENT_IMAGE_MAX_BYTES ||
      file.status !== 'uploaded'
    ) {
      throw new NotFoundException('Payment method image not found');
    }
    const response = (await this.getDownloadUrl(tenantId, fileId)) as {
      download?: { url?: string; expiresAt?: string };
    };
    if (!response.download?.url || !response.download.expiresAt) {
      throw new NotFoundException('Payment method image is not available');
    }
    return {
      fileId,
      downloadUrl: response.download.url,
      expiresAt: response.download.expiresAt,
    };
  }

  async createPlatformUpload(
    userId: string,
    input: CreateMediaUploadDto,
  ): Promise<{
    file: { id: string };
    upload: {
      url: string;
      headers?: Record<string, string>;
      expiresAt?: string;
    };
  }> {
    return this.request('/files/uploads', PLATFORM_MEDIA_SCOPE, {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        ownerId: userId,
      }),
    });
  }

  async createBillingProofUpload(
    tenantId: string,
    userId: string,
    input: CreateMediaUploadDto,
  ) {
    const response = await this.request('/files/uploads', tenantId, {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        purpose: 'billing-payment-proof',
        ownerId: userId,
        // Billing evidence must remain uploadable after a paid period expires;
        // the DTO size limit still bounds each receipt upload.
        storageCapacity: { periodId: null, limitGb: null },
      }),
    });
    // Receipts bypass quota enforcement above, but their bytes still occupy
    // tenant storage. Refresh the capacity snapshot best-effort so the
    // billing usage indicator reflects receipt uploads.
    await this.refreshStorageCapacitySnapshot(tenantId);
    return response;
  }

  getDownloadUrl(tenantId: string, fileId: string, expiresInSeconds = 900) {
    return this.request(
      `/files/${encodeURIComponent(fileId)}/download-url?expiresInSeconds=${expiresInSeconds}`,
      tenantId,
    );
  }

  /**
   * Purpose-scoped signed download for an order payment proof. The finance
   * role can record order payments but is not part of the generic media
   * routes, so proofs are served through this narrower path.
   */
  async getOrderPaymentProofDownloadUrl(tenantId: string, fileId: string) {
    const file = await this.getFile(tenantId, fileId);
    if (
      !file ||
      file.purpose !== 'order-payment-proof' ||
      file.status === 'archived' ||
      !(
        file.contentType?.startsWith('image/') ||
        file.contentType === 'application/pdf'
      )
    ) {
      throw new NotFoundException('Payment proof is not available');
    }
    return this.getDownloadUrl(tenantId, fileId);
  }

  /**
   * Returns file metadata for a tenant-scoped media file. Used by tenant
   * services (e.g. profile image) to validate a file exists before referencing it.
   */
  async getFile(tenantId: string, fileId: string) {
    const file = (await this.request(
      `/files/${encodeURIComponent(fileId)}`,
      tenantId,
    )) as {
      id?: string;
      tenantId?: string;
      purpose?: string;
      contentType?: string;
      sizeBytes?: number;
      status?: string;
    };
    if (!file || file.id !== fileId || file.tenantId !== tenantId) {
      return null;
    }
    return file;
  }

  getPlatformDownloadUrl(fileId: string) {
    return this.request(
      `/files/${encodeURIComponent(fileId)}/download-url`,
      PLATFORM_MEDIA_SCOPE,
    );
  }

  async getPublicImage(fileId: string) {
    const file = (await this.request(
      `/files/${encodeURIComponent(fileId)}`,
      PLATFORM_MEDIA_SCOPE,
    )) as {
      id?: string;
      tenantId?: string;
      status?: string;
      purpose?: string;
    };

    if (
      !file ||
      file.status === 'not_found' ||
      file.status === 'archived' ||
      file.tenantId !== PLATFORM_MEDIA_SCOPE ||
      file.purpose !== PLATFORM_BILLING_ACCOUNT_FILE_PURPOSE
    ) {
      return null;
    }

    const response = (await this.request(
      `/files/${encodeURIComponent(fileId)}/download-url?expiresInSeconds=${PUBLIC_IMAGE_SIGNED_URL_TTL_SECONDS}`,
      PLATFORM_MEDIA_SCOPE,
    )) as { file?: typeof file; download?: { url?: string } };

    if (
      !response.file ||
      response.file.tenantId !== PLATFORM_MEDIA_SCOPE ||
      response.file.purpose !== PLATFORM_BILLING_ACCOUNT_FILE_PURPOSE ||
      !response.download?.url
    ) {
      return null;
    }

    return {
      ...response,
      download: {
        ...response.download,
        url: this.toPublicFileStorageUrl(response.download.url),
      },
    };
  }

  async getBillingProofFile(tenantId: string, fileId: string) {
    const file = (await this.request(
      `/files/${encodeURIComponent(fileId)}`,
      tenantId,
    )) as {
      id?: string;
      status?: string;
      purpose?: string;
      uploadedAt?: string;
    };
    this.assertReadyBillingProofFile(file);
    return file;
  }

  async getBillingProofDownloadUrl(tenantId: string, fileId: string) {
    try {
      const response = (await this.request(
        `/files/${encodeURIComponent(fileId)}/download-url`,
        tenantId,
      )) as {
        file?: {
          id?: string;
          status?: string;
          purpose?: string;
          uploadedAt?: string;
        };
      };
      this.assertReadyBillingProofFile(response.file);
      return response;
    } catch (error) {
      // Plan 47 (R2.2): pricing-registration proofs are platform-scoped (the
      // tenant does not exist at upload time). Fall back to the platform
      // scope only for ready billing-proof files — ids are unguessable and
      // the purpose check keeps tenant files isolated.
      if (!(error instanceof NotFoundException)) throw error;
      const response = (await this.request(
        `/files/${encodeURIComponent(fileId)}/download-url`,
        PLATFORM_MEDIA_SCOPE,
      )) as {
        file?: {
          id?: string;
          status?: string;
          purpose?: string;
          uploadedAt?: string;
        };
      };
      this.assertReadyBillingProofFile(response.file);
      return response;
    }
  }

  /**
   * Plan 47 (R2.2): read a platform-scoped registration payment proof for
   * claim validation at registration time. Reuses the billing-proof readiness
   * contract (correct purpose + uploaded bytes present).
   */
  async getPlatformBillingProofFile(fileId: string) {
    const file = (await this.request(
      `/files/${encodeURIComponent(fileId)}`,
      PLATFORM_MEDIA_SCOPE,
    )) as {
      id?: string;
      status?: string;
      purpose?: string;
      uploadedAt?: string;
    };
    this.assertReadyBillingProofFile(file);
    return file;
  }

  private assertReadyBillingProofFile(
    file:
      | {
          id?: string;
          status?: string;
          purpose?: string;
          uploadedAt?: string;
        }
      | undefined,
  ) {
    if (
      !file ||
      file.status === 'not_found' ||
      file.status === 'archived' ||
      file.purpose !== 'billing-payment-proof' ||
      !file.uploadedAt
    ) {
      throw new NotFoundException('Billing payment-proof file not found');
    }
  }

  archiveFile(tenantId: string, fileId: string) {
    return this.assertNotReferenced(tenantId, fileId).then(() =>
      this.request(`/files/${encodeURIComponent(fileId)}`, tenantId, {
        method: 'DELETE',
      }),
    );
  }

  private async assertNotReferenced(tenantId: string, fileId: string) {
    if (!this.paymentMethodRepository || !this.orderRepository) return;
    const referencedMethod = await this.paymentMethodRepository.findOne({
      where: { tenantId, qrMediaId: fileId },
    });
    if (referencedMethod) {
      throw new ConflictException('media_file_referenced_by_payment_method');
    }
    const snapshot = await this.orderRepository
      .createQueryBuilder('order')
      .where('order.tenant_id = :tenantId', { tenantId })
      .andWhere(`order.payment_method_snapshot ->> 'qrMediaId' = :fileId`, {
        fileId,
      })
      .getOne();
    if (snapshot) {
      throw new ConflictException('media_file_referenced_by_payment_snapshot');
    }
  }

  private async assertStorageLimit(
    tenantId: string,
    incomingBytes: number,
  ): Promise<{ periodId: string | null; limitGb: number | null }> {
    if (isPeriodScopedEnforcementEnabled()) {
      if (!this.subscriptionEntitlementService) {
        throw new ConflictException({
          code: 'SUBSCRIPTION_PERIOD_RESOLVER_UNAVAILABLE',
          message: 'Period-scoped storage capacity is not configured.',
        });
      }
      let entitlement: ResolvedSubscriptionEntitlement;
      try {
        entitlement =
          await this.subscriptionEntitlementService.resolveActiveSubscriptionEntitlement(
            tenantId,
          );
      } catch (error) {
        if (error instanceof MissingActivePeriodError) {
          throw new ConflictException({
            code:
              missingPeriodCodeMap[error.code] ??
              'SUBSCRIPTION_PERIOD_NOT_ACTIVE',
            message: error.message,
            activePeriodId: null,
          });
        }
        throw error;
      }
      const usedBytes = await this.getTenantStorageUsageBytes(tenantId);
      const decision = resolveStorageCapacity({
        baseCapacityGb: entitlement.baseLimits.storage_gb,
        topUpCapacityGb: entitlement.activeTopUpComponentTotals.storage_gb,
        usedBytes,
        incomingBytes: Number(incomingBytes || 0),
      });
      await this.persistStorageCapacityState(tenantId, entitlement, decision);
      if (!decision.canWrite) {
        const limitBytes =
          decision.effectiveCapacityGb === null
            ? null
            : decision.effectiveCapacityGb * 1024 * 1024 * 1024;
        throw new PayloadTooLargeException({
          code: 'STORAGE_LIMIT_REACHED',
          message:
            decision.effectiveCapacityGb === null
              ? 'Storage is unlimited for this active period.'
              : `Storage limit reached. Your active period allows ${this.formatBytes(limitBytes || 0)} and this upload would use ${this.formatBytes(decision.projectedBytes)}.`,
          usedBytes,
          incomingBytes,
          limitBytes,
          effectiveCapacityGb: decision.effectiveCapacityGb,
          activePeriodId: entitlement.activePeriodId,
          expiresAt: entitlement.periodEndAt?.toISOString() || null,
          overStorageLimit: decision.overLimit,
        });
      }
      return {
        periodId: entitlement.activePeriodId,
        limitGb: decision.effectiveCapacityGb,
      };
    }

    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    const plan = tenant?.subscriptionPlanId
      ? await this.subscriptionPlanRepository.findOne({
          where: { id: tenant.subscriptionPlanId },
        })
      : null;
    const rawStorageLimit = plan?.storageLimitGb;
    const storageLimitGb =
      rawStorageLimit === null || rawStorageLimit === undefined
        ? null
        : Number(rawStorageLimit);
    if (storageLimitGb === null) return { periodId: null, limitGb: null };
    if (!Number.isFinite(storageLimitGb) || storageLimitGb < 0) {
      return { periodId: null, limitGb: null };
    }

    const limitBytes = storageLimitGb * BYTES_PER_GB;
    const usedBytes = await this.getTenantStorageUsageBytes(tenantId);
    const projectedBytes = usedBytes + Number(incomingBytes || 0);
    await this.persistStorageCapacityState(tenantId, null, {
      baseCapacityGb: storageLimitGb,
      topUpCapacityGb: 0,
      effectiveCapacityGb: storageLimitGb,
      usedBytes,
      incomingBytes: Number(incomingBytes || 0),
      projectedBytes,
      overLimit: usedBytes > limitBytes,
      canWrite: projectedBytes <= limitBytes,
    });
    if (projectedBytes <= limitBytes) {
      return { periodId: null, limitGb: storageLimitGb };
    }

    throw new PayloadTooLargeException({
      code: 'STORAGE_LIMIT_REACHED',
      message: `Storage limit reached. Your plan allows ${this.formatBytes(limitBytes)} and this upload would use ${this.formatBytes(projectedBytes)}.`,
      usedBytes,
      incomingBytes,
      limitBytes,
    });
  }

  /**
   * Best-effort storage snapshot refresh for quota-exempt uploads (billing
   * receipts). Enforcement is deliberately skipped — receipts must remain
   * uploadable after a period expires — but their bytes still occupy tenant
   * storage, so the snapshot (and the billing usage indicator) is updated.
   * Never throws; failures must not block the upload.
   */
  private async refreshStorageCapacitySnapshot(
    tenantId: string,
  ): Promise<void> {
    try {
      let entitlement: {
        activePeriodId?: string;
        periodEndAt?: Date | null;
      } | null = null;
      let baseCapacityGb: number | null = null;
      let topUpCapacityGb = 0;
      if (
        isPeriodScopedEnforcementEnabled() &&
        this.subscriptionEntitlementService
      ) {
        try {
          const resolved =
            await this.subscriptionEntitlementService.resolveActiveSubscriptionEntitlement(
              tenantId,
            );
          entitlement = resolved;
          baseCapacityGb = resolved.baseLimits.storage_gb;
          topUpCapacityGb = resolved.activeTopUpComponentTotals.storage_gb;
        } catch {
          // No operational period (e.g. expired tenant uploading a receipt):
          // fall through to the plan-based capacity below so usedBytes is
          // still refreshed.
          entitlement = null;
        }
      }
      if (!entitlement) {
        const tenant = await this.tenantRepository.findOne({
          where: { id: tenantId },
        });
        const plan = tenant?.subscriptionPlanId
          ? await this.subscriptionPlanRepository.findOne({
              where: { id: tenant.subscriptionPlanId },
            })
          : null;
        const rawStorageLimit = plan?.storageLimitGb;
        const storageLimitGb =
          rawStorageLimit === null || rawStorageLimit === undefined
            ? null
            : Number(rawStorageLimit);
        baseCapacityGb =
          storageLimitGb !== null &&
          Number.isFinite(storageLimitGb) &&
          storageLimitGb >= 0
            ? storageLimitGb
            : null;
      }
      const usedBytes = await this.getTenantStorageUsageBytes(tenantId);
      await this.persistStorageCapacityState(
        tenantId,
        entitlement,
        resolveStorageCapacity({
          baseCapacityGb,
          topUpCapacityGb,
          usedBytes,
          incomingBytes: 0,
        }),
      );
    } catch {
      // Snapshot refresh must never block the upload.
    }
  }

  private async persistStorageCapacityState(
    tenantId: string,
    entitlement: { activePeriodId?: string; periodEndAt?: Date | null } | null,
    decision: {
      baseCapacityGb: number | null;
      topUpCapacityGb: number;
      effectiveCapacityGb: number | null;
      usedBytes: number;
      incomingBytes: number;
      projectedBytes: number;
      overLimit: boolean;
      canWrite: boolean;
    },
  ) {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) return;
    tenant.storageCapacityState = {
      activePeriodId: entitlement?.activePeriodId || null,
      expiresAt: entitlement?.periodEndAt?.toISOString() || null,
      baseCapacityGb: decision.baseCapacityGb,
      topUpCapacityGb: decision.topUpCapacityGb,
      effectiveCapacityGb: decision.effectiveCapacityGb,
      usedBytes: decision.usedBytes,
      projectedBytes: decision.projectedBytes,
      overStorageLimit: decision.overLimit,
      lastEvaluatedAt: new Date().toISOString(),
    };
    await this.tenantRepository.save(tenant);
  }

  private async getTenantStorageUsageBytes(tenantId: string) {
    let page = 1;
    let total = 0;
    let hasNext = true;

    while (hasNext) {
      const response = (await this.request(
        `/files?page=${page}&limit=100`,
        tenantId,
      )) as StorageListResponse;
      total += (response.data || []).reduce(
        (sum, file) => sum + Number(file.sizeBytes || 0),
        0,
      );
      hasNext = Boolean(response.hasNext);
      page += 1;
    }

    return total;
  }

  private formatBytes(bytes: number) {
    if (bytes >= BYTES_PER_GB) return `${(bytes / BYTES_PER_GB).toFixed(2)} GB`;
    return `${Math.ceil(bytes / (1024 * 1024)).toLocaleString()} MB`;
  }

  private toPublicFileStorageUrl(signedUrl: string): string {
    const publicBaseEnv = { ...process.env } as Record<
      string,
      string | undefined
    >;
    if (
      publicBaseEnv.NODE_ENV !== 'production' &&
      !publicBaseEnv.PUBLIC_FILE_STORAGE_BASE_URL &&
      !publicBaseEnv.FILE_STORAGE_PUBLIC_URL
    ) {
      publicBaseEnv.PUBLIC_FILE_STORAGE_BASE_URL =
        publicBaseEnv.FILE_STORAGE_URL || 'http://localhost:6005';
    }
    const publicBaseUrl = resolvePublicBaseUrl(
      publicBaseEnv,
      'PUBLIC_FILE_STORAGE_BASE_URL',
      { fallbackEnvVarNames: ['FILE_STORAGE_PUBLIC_URL'] },
    );
    if (!publicBaseUrl) {
      throw new ServiceUnavailableException(
        'PUBLIC_FILE_STORAGE_BASE_URL is not configured',
      );
    }

    const publicUrl = new URL(publicBaseUrl);
    const signed = new URL(signedUrl);
    signed.protocol = publicUrl.protocol;
    signed.username = publicUrl.username;
    signed.password = publicUrl.password;
    signed.host = publicUrl.host;
    return signed.toString();
  }

  private async request(
    path: string,
    tenantId: string,
    init: RequestInit = {},
  ) {
    const serviceUrl = process.env.FILE_STORAGE_URL;
    if (!serviceUrl) {
      throw new ServiceUnavailableException(
        'FILE_STORAGE_URL is not configured',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${serviceUrl.replace(/\/$/, '')}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': tenantId,
          ...serviceAuthHeaders({
            audience: SERVICE_IDENTITIES.FILE_STORAGE,
            subject: SERVICE_IDENTITIES.CORE,
            scopes: this.scopeForStorageRequest(path, init.method),
          }),
          ...(init.headers || {}),
        },
      });
    } catch (error) {
      throw new BadGatewayException(
        `File storage service is unavailable: ${error instanceof Error ? error.message : 'request failed'}`,
      );
    }

    const body = await response
      .json()
      .catch(() => ({ message: response.statusText }));
    if (!response.ok) {
      throw new BadGatewayException({
        message: 'File storage request failed',
        statusCode: response.status,
        details: body,
      });
    }
    return body;
  }

  private scopeForStorageRequest(path: string, method?: string) {
    const normalizedMethod = (method || 'GET').toUpperCase();
    if (path === '/files/metadata') return [SERVICE_SCOPES.FILE_METADATA_WRITE];
    if (path === '/files/uploads' || normalizedMethod === 'DELETE')
      return [SERVICE_SCOPES.FILE_WRITE];
    return [SERVICE_SCOPES.FILE_READ];
  }
}
