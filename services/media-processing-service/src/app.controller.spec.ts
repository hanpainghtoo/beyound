import { Test, TestingModule } from '@nestjs/testing';
import { rmSync } from 'fs';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  const originalStorePath = process.env.MEDIA_JOB_STORE_PATH;
  const originalWorkerEnabled = process.env.MEDIA_WORKER_ENABLED;
  const originalRetryDelay = process.env.MEDIA_JOB_RETRY_BASE_DELAY_MS;
  const originalMaxAttempts = process.env.MEDIA_JOB_MAX_ATTEMPTS;
  const originalFileStorageUrl = process.env.FILE_STORAGE_URL;
  const originalCoreApiUrl = process.env.CORE_API_URL;
  const originalCallbackUrl = process.env.MEDIA_STATUS_CALLBACK_URL;
  const originalImageMode = process.env.MEDIA_IMAGE_PROCESSING_MODE;
  const originalInternalSigningKey = process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY;
  const originalFetch = global.fetch;
  const storePath = `/tmp/commerce-os-media-jobs-${process.pid}.json`;

  beforeEach(async () => {
    process.env.MEDIA_JOB_STORE_PATH = storePath;
    process.env.MEDIA_WORKER_ENABLED = 'false';
    process.env.MEDIA_JOB_RETRY_BASE_DELAY_MS = '0';
    process.env.MEDIA_JOB_MAX_ATTEMPTS = '3';
    process.env.FILE_STORAGE_URL = 'http://file-storage.test.local';
    process.env.MEDIA_IMAGE_PROCESSING_MODE = 'placeholder';
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = 'test-internal-service-token-signing-key-32-chars';
    delete process.env.CORE_API_URL;
    delete process.env.MEDIA_STATUS_CALLBACK_URL;
    rmSync(storePath, { force: true });

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    if (originalStorePath === undefined)
      delete process.env.MEDIA_JOB_STORE_PATH;
    else process.env.MEDIA_JOB_STORE_PATH = originalStorePath;
    if (originalWorkerEnabled === undefined)
      delete process.env.MEDIA_WORKER_ENABLED;
    else process.env.MEDIA_WORKER_ENABLED = originalWorkerEnabled;
    if (originalRetryDelay === undefined)
      delete process.env.MEDIA_JOB_RETRY_BASE_DELAY_MS;
    else process.env.MEDIA_JOB_RETRY_BASE_DELAY_MS = originalRetryDelay;
    if (originalMaxAttempts === undefined)
      delete process.env.MEDIA_JOB_MAX_ATTEMPTS;
    else process.env.MEDIA_JOB_MAX_ATTEMPTS = originalMaxAttempts;
    if (originalFileStorageUrl === undefined)
      delete process.env.FILE_STORAGE_URL;
    else process.env.FILE_STORAGE_URL = originalFileStorageUrl;
    if (originalCoreApiUrl === undefined) delete process.env.CORE_API_URL;
    else process.env.CORE_API_URL = originalCoreApiUrl;
    if (originalCallbackUrl === undefined)
      delete process.env.MEDIA_STATUS_CALLBACK_URL;
    else process.env.MEDIA_STATUS_CALLBACK_URL = originalCallbackUrl;
    if (originalImageMode === undefined)
      delete process.env.MEDIA_IMAGE_PROCESSING_MODE;
    else process.env.MEDIA_IMAGE_PROCESSING_MODE = originalImageMode;
    if (originalInternalSigningKey === undefined)
      delete process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY;
    else process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = originalInternalSigningKey;
    rmSync(storePath, { force: true });
  });

  describe('root', () => {
    it('should return health status', () => {
      expect(appController.getHealth()).toMatchObject({
        service: 'media-processing-service',
        status: 'ok',
      });
    });
  });

  describe('media jobs', () => {
    it('should create and read media jobs', () => {
      const job = appController.createJob({
        tenantId: 'tenant-1',
        fileId: 'file-1',
        jobType: 'thumbnail',
      });

      expect(job).toMatchObject({
        tenantId: 'tenant-1',
        fileId: 'file-1',
        jobType: 'thumbnail',
        status: 'queued',
      });
      expect(appController.getJob(job.id)).toEqual(job);

      const restartedService = new AppService();
      expect(restartedService.getJob(job.id)).toEqual(job);
    });

    it('processes queued jobs through explicit transitions and output metadata', async () => {
      const job = appController.createJob({
        tenantId: 'tenant-1',
        fileId: 'file-1',
        jobType: 'thumbnail',
        options: { width: 240, height: 180 },
      });

      const processed = await appController.processJob(job.id);
      if (!('outputs' in processed)) {
        throw new Error('Expected processed media job');
      }

      expect(processed).toMatchObject({
        id: job.id,
        status: 'completed',
        attempts: 1,
        callbackStatus: 'skipped',
        outputs: [
          {
            type: 'thumbnail',
            sourceFileId: 'file-1',
            fileId: 'file-1:thumbnail',
            status: 'placeholder',
            metadata: {
              width: 240,
              height: 180,
              binaryGenerationPending: true,
            },
          },
        ],
      });
      expect(appController.getJob(job.id)).toMatchObject({
        status: 'completed',
        outputs: processed.outputs,
      });
    });

    it('retries transient failures and eventually completes', async () => {
      const job = appController.createJob({
        tenantId: 'tenant-1',
        fileId: 'file-1',
        jobType: 'scan',
        options: { failAttempts: 1 },
      });

      await appController.drainJobs();

      expect(appController.getJob(job.id)).toMatchObject({
        status: 'completed',
        attempts: 2,
        outputs: [
          {
            type: 'file-scan',
            provider: 'placeholder',
            status: 'placeholder',
            metadata: {
              verdict: 'not_scanned',
              providerConfigured: false,
            },
          },
        ],
      });
    });

    it('fails jobs after max attempts', async () => {
      const job = appController.createJob({
        tenantId: 'tenant-1',
        fileId: 'file-1',
        jobType: 'transcribe',
        options: { forceFailure: true },
      });

      await appController.drainJobs();

      expect(appController.getJob(job.id)).toMatchObject({
        status: 'failed',
        attempts: 3,
        lastError: 'Forced media job failure',
        callbackStatus: 'skipped',
      });
    });

    it('sends status callbacks when a callback endpoint is configured', async () => {
      process.env.MEDIA_STATUS_CALLBACK_URL =
        'https://core.test/media/jobs/status';
      const fetchMock = jest.fn(() =>
        Promise.resolve({ ok: true } as Response),
      );
      global.fetch = fetchMock as unknown as typeof fetch;

      const job = appController.createJob({
        tenantId: 'tenant-1',
        fileId: 'file-1',
        jobType: 'optimize',
      });

      const processed = await appController.processJob(job.id);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://core.test/media/jobs/status',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(processed).toMatchObject({
        status: 'completed',
        callbackAttempts: 2,
        callbackStatus: 'sent',
      });
    });

    it('generates real thumbnails through file storage signed URLs', async () => {
      process.env.MEDIA_IMAGE_PROCESSING_MODE = 'sharp';
      const sourceContent = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWMwTvuPFTEMLQkAqBFmAWlht3MAAAAASUVORK5CYII=',
        'base64',
      );
      const sourceFile = {
        id: 'file-1',
        tenantId: 'tenant-1',
        fileName: 'source.png',
        contentType: 'image/png',
        sizeBytes: sourceContent.length,
        status: 'registered',
      };
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(sourceFile),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              file: sourceFile,
              download: {
                driver: 'local-disk',
                method: 'GET',
                url: 'http://localhost:3005/files/file-1/content?tenantId=tenant-1&expires=1&signature=sig',
                objectKey: 'tenants/tenant-1/file-1/source.png',
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
              },
            }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(
              sourceContent.buffer.slice(
                sourceContent.byteOffset,
                sourceContent.byteOffset + sourceContent.byteLength,
              ),
            ),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              file: {
                id: 'file-thumb-1',
                tenantId: 'tenant-1',
                fileName: 'source-thumbnail.webp',
                contentType: 'image/webp',
                sizeBytes: 72,
                status: 'registered',
              },
              upload: {
                driver: 'local-disk',
                method: 'PUT',
                url: 'http://localhost:3005/files/file-thumb-1/content?tenantId=tenant-1&expires=1&signature=sig',
                objectKey:
                  'tenants/tenant-1/file-thumb-1/source-thumbnail.webp',
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                headers: { 'content-type': 'image/webp' },
              },
            }),
        } as Response)
        .mockResolvedValueOnce({ ok: true } as Response);
      global.fetch = fetchMock as unknown as typeof fetch;

      const job = appController.createJob({
        tenantId: 'tenant-1',
        fileId: 'file-1',
        jobType: 'thumbnail',
        options: { width: 16, height: 16 },
      });

      const processed = await appController.processJob(job.id);
      const downloadCall = fetchMock.mock.calls[2] as [string, RequestInit?];
      const uploadCall = fetchMock.mock.calls[4] as [string, RequestInit?];

      expect(fetchMock).toHaveBeenCalledTimes(5);
      expect(downloadCall[0]).toBe(
        'http://file-storage.test.local/files/file-1/content?tenantId=tenant-1&expires=1&signature=sig',
      );
      expect(uploadCall[0]).toBe(
        'http://file-storage.test.local/files/file-thumb-1/content?tenantId=tenant-1&expires=1&signature=sig',
      );
      expect(processed).toMatchObject({
        status: 'completed',
        outputs: [
          {
            type: 'thumbnail',
            fileId: 'file-thumb-1',
            status: 'generated',
            metadata: {
              strategy: 'sharp',
              contentType: 'image/webp',
              sourceContentType: 'image/png',
            },
          },
        ],
      });
    });
  });
});
