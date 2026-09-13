import { Test, TestingModule } from '@nestjs/testing';
import { rmSync } from 'fs';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  const originalMetadataPath = process.env.FILE_METADATA_PATH;
  const originalObjectStoragePath = process.env.FILE_OBJECT_STORAGE_PATH;
  const originalStorageDriver = process.env.STORAGE_DRIVER;
  const originalFileStoragePublicUrl = process.env.FILE_STORAGE_PUBLIC_URL;
  const originalSignedUrlTtlSeconds = process.env.SIGNED_URL_TTL_SECONDS;
  const originalLocalStorageSigningSecret =
    process.env.LOCAL_STORAGE_SIGNING_SECRET;
  const originalRedisUrl = process.env.REDIS_URL;
  const originalRedisHost = process.env.REDIS_HOST;
  const originalRedisPort = process.env.REDIS_PORT;
  const originalStorageCapacityRedisUrl =
    process.env.STORAGE_CAPACITY_REDIS_URL;
  const metadataPath = `/tmp/commerce-os-file-metadata-${process.pid}.json`;
  const objectStoragePath = `/tmp/commerce-os-file-objects-${process.pid}`;

  beforeEach(async () => {
    process.env.FILE_METADATA_PATH = metadataPath;
    process.env.FILE_OBJECT_STORAGE_PATH = objectStoragePath;
    process.env.STORAGE_DRIVER = 'local-disk';
    process.env.FILE_STORAGE_PUBLIC_URL = 'http://files.test.local';
    process.env.SIGNED_URL_TTL_SECONDS = '900';
    process.env.LOCAL_STORAGE_SIGNING_SECRET =
      'test-local-storage-signing-secret-123!';
    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.STORAGE_CAPACITY_REDIS_URL;
    rmSync(metadataPath, { force: true });
    rmSync(objectStoragePath, { force: true, recursive: true });
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  afterAll(() => {
    if (originalMetadataPath === undefined)
      delete process.env.FILE_METADATA_PATH;
    else process.env.FILE_METADATA_PATH = originalMetadataPath;
    if (originalObjectStoragePath === undefined)
      delete process.env.FILE_OBJECT_STORAGE_PATH;
    else process.env.FILE_OBJECT_STORAGE_PATH = originalObjectStoragePath;
    if (originalStorageDriver === undefined) delete process.env.STORAGE_DRIVER;
    else process.env.STORAGE_DRIVER = originalStorageDriver;
    if (originalFileStoragePublicUrl === undefined)
      delete process.env.FILE_STORAGE_PUBLIC_URL;
    else process.env.FILE_STORAGE_PUBLIC_URL = originalFileStoragePublicUrl;
    if (originalSignedUrlTtlSeconds === undefined)
      delete process.env.SIGNED_URL_TTL_SECONDS;
    else process.env.SIGNED_URL_TTL_SECONDS = originalSignedUrlTtlSeconds;
    if (originalLocalStorageSigningSecret === undefined)
      delete process.env.LOCAL_STORAGE_SIGNING_SECRET;
    else
      process.env.LOCAL_STORAGE_SIGNING_SECRET =
        originalLocalStorageSigningSecret;
    restoreEnv('REDIS_URL', originalRedisUrl);
    restoreEnv('REDIS_HOST', originalRedisHost);
    restoreEnv('REDIS_PORT', originalRedisPort);
    restoreEnv('STORAGE_CAPACITY_REDIS_URL', originalStorageCapacityRedisUrl);
    rmSync(metadataPath, { force: true });
    rmSync(objectStoragePath, { force: true, recursive: true });
  });

  describe('root', () => {
    it('should return health status', () => {
      expect(appController.getHealth()).toMatchObject({
        service: 'file-storage-service',
        status: 'ok',
      });
    });
  });

  describe('files', () => {
    it('fails to initialize local storage without a signing secret', () => {
      delete process.env.LOCAL_STORAGE_SIGNING_SECRET;
      expect(() => new AppService()).toThrow(
        'LOCAL_STORAGE_SIGNING_SECRET is required',
      );
      process.env.LOCAL_STORAGE_SIGNING_SECRET =
        'test-local-storage-signing-secret-123!';
    });

    it('should register and read file metadata', () => {
      const file = appController.registerFile('tenant-1', {
        fileName: 'receipt.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1200,
        purpose: 'payment-proof',
      });

      expect(file).toMatchObject({
        tenantId: 'tenant-1',
        fileName: 'receipt.jpg',
        storageDriver: 'local-disk',
        objectKey: expect.stringContaining('tenant-1') as unknown as string,
        status: 'registered',
      });
      expect(appController.getFile('tenant-1', file.id)).toEqual(file);
      expect(appController.getFile('tenant-2', file.id)).toEqual({
        id: file.id,
        status: 'not_found',
      });

      const restartedService = new AppService();
      expect(restartedService.getFile('tenant-1', file.id)).toEqual(file);
    });

    it('rejects missing tenant context and ignores body tenant ownership', () => {
      expect(() =>
        appController.registerFile(undefined, {
          fileName: 'receipt.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 1200,
        }),
      ).toThrow('Tenant context is required');

      const file = appController.registerFile('tenant-1', {
        tenantId: 'tenant-2',
        fileName: 'receipt.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1200,
      });
      expect(file.tenantId).toBe('tenant-1');
    });

    it('rejects a capacity-exceeding upload at the storage boundary', async () => {
      await expect(
        appController.createSignedUpload('tenant-1', {
          fileName: 'over-limit.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 1,
          storageCapacity: { periodId: 'period-1', limitGb: 0 },
        }),
      ).rejects.toThrow(
        'Storage capacity was exceeded before upload registration',
      );
    });

    it('allows a new upload after archived data is excluded from capacity usage', async () => {
      const existing = appController.registerFile('tenant-1', {
        fileName: 'old.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1,
      });
      expect(appController.archiveFile('tenant-1', existing.id)).toMatchObject({
        status: 'archived',
      });

      await expect(
        appController.createSignedUpload('tenant-1', {
          fileName: 'new.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 1,
          storageCapacity: {
            periodId: 'period-1',
            limitGb: 0.000000001,
          },
        }),
      ).resolves.toMatchObject({ file: { tenantId: 'tenant-1' } });
    });

    it('validates file size and content type', () => {
      expect(() =>
        appController.registerFile('tenant-1', {
          fileName: 'malware.exe',
          contentType: 'application/x-msdownload',
          sizeBytes: 1200,
        }),
      ).toThrow('Unsupported content type');

      expect(() =>
        appController.registerFile('tenant-1', {
          fileName: 'empty.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 0,
        }),
      ).toThrow('File size must be between');
    });

    it('archives files without exposing them across tenants', () => {
      const file = appController.registerFile('tenant-1', {
        fileName: 'receipt.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1200,
      });

      expect(appController.archiveFile('tenant-2', file.id)).toEqual({
        id: file.id,
        status: 'not_found',
      });
      expect(appController.archiveFile('tenant-1', file.id)).toMatchObject({
        id: file.id,
        tenantId: 'tenant-1',
        status: 'archived',
        archivedAt: expect.any(String) as unknown as string,
      });
    });

    it('lists active uploaded files only within the requested tenant', async () => {
      const first = await appController.createSignedUpload('tenant-1', {
        fileName: 'catalog-phone.png',
        contentType: 'image/png',
        sizeBytes: 5,
        purpose: 'product-image',
      });
      const uploadUrl = new URL(first.upload.url);
      appController.writeFileContent(
        first.file.id,
        uploadUrl.searchParams.get('tenantId')!,
        uploadUrl.searchParams.get('expires')!,
        uploadUrl.searchParams.get('signature')!,
        { body: Buffer.from('image') },
      );
      await appController.createSignedUpload('tenant-2', {
        fileName: 'other-tenant.png',
        contentType: 'image/png',
        sizeBytes: 5,
      });

      const result = appController.listFiles(
        'tenant-1',
        'phone',
        'product-image',
        'image/',
        '1',
        '20',
      );

      expect(result.total).toBe(1);
      expect(result.data[0]).toMatchObject({
        id: first.file.id,
        tenantId: 'tenant-1',
        fileName: 'catalog-phone.png',
        download: { method: 'GET' },
      });
    });

    it('preserves existing files when active storage capacity falls below usage', async () => {
      const response = await appController.createSignedUpload('tenant-1', {
        fileName: 'over-limit.txt',
        contentType: 'text/plain',
        sizeBytes: 5,
        storageCapacity: { periodId: 'period-1', limitGb: 1 },
      });
      const uploadUrl = new URL(response.upload.url);
      appController.writeFileContent(
        response.file.id,
        uploadUrl.searchParams.get('tenantId')!,
        uploadUrl.searchParams.get('expires')!,
        uploadUrl.searchParams.get('signature')!,
        { body: Buffer.from('hello') },
      );

      const overLimit = appController.createSignedUpload('tenant-1', {
        fileName: 'blocked.txt',
        contentType: 'text/plain',
        sizeBytes: 1,
        storageCapacity: { periodId: 'period-1', limitGb: 0 },
      });
      await expect(overLimit).rejects.toThrow(
        'Storage capacity was exceeded before upload registration',
      );
      expect(appController.getFile('tenant-1', response.file.id)).toMatchObject(
        {
          id: response.file.id,
          status: 'uploaded',
        },
      );

      const signedDownload = appController.getSignedDownload(
        'tenant-1',
        response.file.id,
      );
      if (!('download' in signedDownload) || !signedDownload.download) {
        throw new Error('Expected signed download URL');
      }
      const downloadUrl = new URL(signedDownload.download.url);
      const headers: Record<string, string> = {};
      const read = appController.readFileContent(
        response.file.id,
        downloadUrl.searchParams.get('tenantId')!,
        downloadUrl.searchParams.get('expires')!,
        downloadUrl.searchParams.get('signature')!,
        { setHeader: (name: string, value: string) => (headers[name] = value) },
      );
      expect(read.toString('utf8')).toBe('hello');
      expect(headers['content-length']).toBe('5');

      expect(appController.archiveFile('tenant-2', response.file.id)).toEqual({
        id: response.file.id,
        status: 'not_found',
      });
      expect(
        appController.archiveFile('tenant-1', response.file.id),
      ).toMatchObject({
        id: response.file.id,
        status: 'archived',
      });
      expect(
        appController.getSignedDownload('tenant-1', response.file.id),
      ).toEqual({
        id: response.file.id,
        status: 'archived',
      });
    });

    it('creates local signed upload and download URLs with tenant-scoped content access', async () => {
      const response = await appController.createSignedUpload('tenant-1', {
        tenantId: 'tenant-2',
        fileName: 'note.txt',
        contentType: 'text/plain',
        sizeBytes: 11,
      });

      expect(response.file).toMatchObject({
        tenantId: 'tenant-1',
        storageDriver: 'local-disk',
        fileName: 'note.txt',
      });
      expect(response.upload).toMatchObject({
        driver: 'local-disk',
        method: 'PUT',
        objectKey: response.file.objectKey,
        headers: { 'content-type': 'text/plain' },
      });

      const uploadUrl = new URL(response.upload.url);
      expect(uploadUrl.origin).toBe('http://files.test.local');
      expect(
        appController.writeFileContent(
          response.file.id,
          uploadUrl.searchParams.get('tenantId')!,
          uploadUrl.searchParams.get('expires')!,
          uploadUrl.searchParams.get('signature')!,
          { body: Buffer.from('hello world') },
        ),
      ).toMatchObject({
        id: response.file.id,
        status: 'uploaded',
        sizeBytes: 11,
      });

      expect(
        appController.getSignedDownload('tenant-2', response.file.id),
      ).toEqual({
        id: response.file.id,
        status: 'not_found',
      });

      const downloadResponse = appController.getSignedDownload(
        'tenant-1',
        response.file.id,
      );
      if (!('download' in downloadResponse)) {
        throw new Error('Expected signed download response');
      }
      const signedDownload = downloadResponse.download;
      if (!signedDownload) throw new Error('Expected signed download URL');
      const downloadUrl = new URL(signedDownload.url);
      const headers: Record<string, string> = {};
      const content = appController.readFileContent(
        response.file.id,
        downloadUrl.searchParams.get('tenantId')!,
        downloadUrl.searchParams.get('expires')!,
        downloadUrl.searchParams.get('signature')!,
        { setHeader: (name: string, value: string) => (headers[name] = value) },
      );

      expect(content.toString('utf8')).toBe('hello world');
      expect(headers['content-type']).toBe('text/plain');
      expect(headers['content-length']).toBe('11');
    });

    it('creates S3-compatible signed URLs for production object storage', async () => {
      process.env.STORAGE_DRIVER = 's3-compatible';
      process.env.S3_ENDPOINT = 'https://s3.example.test';
      process.env.S3_REGION = 'ap-southeast-1';
      process.env.S3_BUCKET = 'commerce-os-files';
      process.env.S3_ACCESS_KEY_ID = 'access-key';
      process.env.S3_SECRET_ACCESS_KEY = 'secret-key';
      process.env.S3_OBJECT_KEY_PREFIX = 'uploads';
      const service = new AppService();

      const response = await service.createSignedUpload('tenant-1', {
        fileName: 'receipt.png',
        contentType: 'image/png',
        sizeBytes: 2048,
      });
      const uploadUrl = new URL(response.upload.url);

      expect(response.file).toMatchObject({
        tenantId: 'tenant-1',
        storageDriver: 's3-compatible',
        objectKey: expect.stringContaining(
          'uploads/tenants/tenant-1/',
        ) as unknown as string,
      });
      expect(response.upload).toMatchObject({
        driver: 's3-compatible',
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
      });
      expect(uploadUrl.origin).toBe('https://s3.example.test');
      expect(uploadUrl.pathname).toContain(
        '/commerce-os-files/uploads/tenants/tenant-1/',
      );
      expect(uploadUrl.searchParams.get('X-Amz-Algorithm')).toBe(
        'AWS4-HMAC-SHA256',
      );
      expect(uploadUrl.searchParams.get('X-Amz-Credential')).toContain(
        'access-key/20',
      );
      expect(uploadUrl.searchParams.get('X-Amz-SignedHeaders')).toBe(
        'content-type;host',
      );
      expect(uploadUrl.searchParams.get('X-Amz-Signature')).toMatch(
        /^[a-f0-9]{64}$/,
      );
    });
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
