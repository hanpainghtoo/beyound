/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- Repository doubles keep this media capacity suite focused on write policy. */
import { NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { MediaLibraryService } from './media-library.service';

function createRepository(result: unknown) {
  return {
    findOne: jest.fn(async () => result),
    save: jest.fn(async (value) => value),
  };
}

function createService(
  options: {
    planStorageLimitGb?: number;
    listedFiles?: Array<{ sizeBytes: number }>;
    entitlement?: any;
  } = {},
) {
  const tenantRepository = createRepository({
    id: 'tenant-1',
    subscriptionPlanId: 'plan-1',
  });
  const subscriptionPlanRepository = createRepository({
    id: 'plan-1',
    storageLimitGb: options.planStorageLimitGb ?? 1,
  });
  const tenantEntitlementRepository = createRepository({
    state: 'paid_active',
  });
  const service = new MediaLibraryService(
    tenantRepository as any,
    subscriptionPlanRepository as any,
  );
  (service as any).subscriptionEntitlementService = {
    resolveActiveSubscriptionEntitlement: jest.fn(
      async () =>
        options.entitlement || {
          activePeriodId: 'period-1',
          periodEndAt: new Date('2026-09-01T00:00:00.000Z'),
          baseLimits: { storage_gb: options.planStorageLimitGb ?? 1 },
          activeTopUpComponentTotals: { storage_gb: 0 },
          effectiveLimits: { storage_gb: options.planStorageLimitGb ?? 1 },
        },
    ),
  };
  const request = jest
    .spyOn(service as any, 'request')
    .mockImplementation(async (path: string) => {
      if (path.startsWith('/files?')) {
        return {
          data: options.listedFiles || [],
          hasNext: false,
          page: 1,
        };
      }
      return {
        file: { id: 'file-1' },
        upload: { url: 'https://uploads.example/file-1' },
      };
    });

  return { service, request };
}

describe('MediaLibraryService storage limits', () => {
  const originalEnforcementFlag =
    process.env.SUBSCRIPTION_PERIOD_ENFORCEMENT_ENABLED;

  afterEach(() => {
    if (originalEnforcementFlag === undefined) {
      delete process.env.SUBSCRIPTION_PERIOD_ENFORCEMENT_ENABLED;
    } else {
      process.env.SUBSCRIPTION_PERIOD_ENFORCEMENT_ENABLED =
        originalEnforcementFlag;
    }
  });

  it('rejects upload creation when the tenant would exceed plan storage', async () => {
    const { service, request } = createService({
      planStorageLimitGb: 1,
      listedFiles: [{ sizeBytes: 900 * 1024 * 1024 }],
    });

    await expect(
      service.createUpload('tenant-1', 'user-1', {
        fileName: 'large-video.mp4',
        contentType: 'video/mp4',
        sizeBytes: 200 * 1024 * 1024,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);

    expect(request).not.toHaveBeenCalledWith(
      '/files/uploads',
      expect.any(String),
      expect.anything(),
    );
  });

  it('blocks capacity-increasing uploads after a storage top-up expires while preserving file operations', async () => {
    process.env.SUBSCRIPTION_PERIOD_ENFORCEMENT_ENABLED = 'true';
    const { service, request } = createService({
      listedFiles: [{ sizeBytes: 900 * 1024 * 1024 }],
      entitlement: {
        baseLimits: { storage_gb: 1 },
        activeTopUpComponentTotals: { storage_gb: 0 },
        activePeriodId: 'period-1',
        periodEndAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });

    await expect(
      service.createUpload('tenant-1', 'user-1', {
        fileName: 'new-video.mp4',
        contentType: 'video/mp4',
        sizeBytes: 200 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'STORAGE_LIMIT_REACHED',
        activePeriodId: 'period-1',
      }),
    });
    expect(request).not.toHaveBeenCalledWith(
      '/files/uploads',
      'tenant-1',
      expect.anything(),
    );
  });

  it('creates a billing-proof upload without consuming workspace storage capacity', async () => {
    const { service, request } = createService({
      planStorageLimitGb: 0,
      listedFiles: [{ sizeBytes: 900 * 1024 * 1024 }],
    });

    await expect(
      service.createBillingProofUpload('tenant-1', 'owner-1', {
        fileName: 'receipt.png',
        contentType: 'image/png',
        sizeBytes: 2 * 1024 * 1024,
        purpose: 'ignored-client-purpose',
      }),
    ).resolves.toMatchObject({ file: { id: 'file-1' } });

    expect(request).toHaveBeenCalledWith(
      '/files/uploads',
      'tenant-1',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('billing-payment-proof'),
      }),
    );
  });

  it('only returns tenant-owned billing-proof files through the billing-proof download path', async () => {
    const { service, request } = createService();
    request.mockResolvedValueOnce({
      file: {
        id: 'file-1',
        status: 'registered',
        purpose: 'billing-payment-proof',
        uploadedAt: '2026-07-10T00:00:00.000Z',
      },
      download: { url: 'https://downloads.example/file-1' },
    });

    await expect(
      service.getBillingProofDownloadUrl('tenant-1', 'file-1'),
    ).resolves.toMatchObject({
      file: { purpose: 'billing-payment-proof' },
    });

    request.mockResolvedValueOnce({
      file: {
        id: 'file-2',
        status: 'registered',
        purpose: 'media-library',
        uploadedAt: '2026-07-10T00:00:00.000Z',
      },
      download: { url: 'https://downloads.example/file-2' },
    });
    await expect(
      service.getBillingProofDownloadUrl('tenant-1', 'file-2'),
    ).rejects.toBeInstanceOf(NotFoundException);

    request.mockResolvedValueOnce({
      file: {
        id: 'file-3',
        status: 'registered',
        purpose: 'billing-payment-proof',
      },
      download: { url: 'https://downloads.example/file-3' },
    });
    await expect(
      service.getBillingProofDownloadUrl('tenant-1', 'file-3'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates the signed upload when the tenant remains under plan storage', async () => {
    const { service, request } = createService({
      planStorageLimitGb: 1,
      listedFiles: [{ sizeBytes: 100 * 1024 * 1024 }],
    });

    await expect(
      service.createUpload('tenant-1', 'user-1', {
        fileName: 'catalog-photo.png',
        contentType: 'image/png',
        sizeBytes: 2 * 1024 * 1024,
      }),
    ).resolves.toMatchObject({ file: { id: 'file-1' } });

    expect(request).toHaveBeenCalledWith(
      '/files/uploads',
      'tenant-1',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
