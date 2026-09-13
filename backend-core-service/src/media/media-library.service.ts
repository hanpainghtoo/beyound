/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- Legacy media library request helper returns file-storage JSON contracts; this task only changes internal auth headers. */
import {
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
import { Tenant } from '../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { SubscriptionEntitlementService } from '../subscription-period/subscription-entitlement.service';
import { isPeriodScopedEnforcementEnabled } from '../subscription-period/subscription-entitlement-flag.util';
import { resolveStorageCapacity } from './storage-capacity.util';
import { resolvePublicBaseUrl } from '../config/public-base-url';

type StorageListResponse = {
  data?: Array<{ sizeBytes?: number }>;
  hasNext?: boolean;
};

const BYTES_PER_GB = 1024 * 1024 * 1024;
export const PLATFORM_MEDIA_SCOPE = 'platform';
export const PLATFORM_BILLING_ACCOUNT_FILE_PURPOSE = 'platform-billing-account';
export const PUBLIC_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const PUBLIC_BILLING_ACCOUNTS_CACHE_MAX_AGE_SECONDS = 5 * 60;
export const PUBLIC_BILLING_ACCOUNTS_CACHE_CONTROL = `public, max-age=${PUBLIC_BILLING_ACCOUNTS_CACHE_MAX_AGE_SECONDS}`;

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
  ) {}

  async listFiles(tenantId: string, query: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    for (const key of ['search', 'purpose', 'contentType', 'page', 'limit']) {
      const value = query[key];
      if (value) params.set(key, value);
    }
    const suffix = params.size ? `?${params.toString()}` : '';
    return this.request(`/files${suffix}`, tenantId);
  }

  async createUpload(
    tenantId: string,
    userId: string,
    input: CreateMediaUploadDto,
  ) {
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

  async createPlatformUpload(userId: string, input: CreateMediaUploadDto) {
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
    return this.request('/files/uploads', tenantId, {
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
  }

  getDownloadUrl(tenantId: string, fileId: string) {
    return this.request(
      `/files/${encodeURIComponent(fileId)}/download-url`,
      tenantId,
    );
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
    return this.request(`/files/${encodeURIComponent(fileId)}`, tenantId, {
      method: 'DELETE',
    });
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
      const entitlement =
        await this.subscriptionEntitlementService.resolveActiveSubscriptionEntitlement(
          tenantId,
        );
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
