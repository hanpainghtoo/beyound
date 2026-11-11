import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { rmSync } from 'fs';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { raw } from 'express';
import {
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  signServiceToken,
} from '@zayos/internal-service-auth';
import { AppModule } from './../src/app.module';
import { getFileStorageCorsOptions } from './../src/cors.config';

type FileMetadataResponse = {
  id: string;
  tenantId: string;
  fileName: string;
  status: string;
  storageDriver?: string;
  objectKey?: string;
};

type SignedStorageUrlResponse = {
  driver: string;
  method: 'GET' | 'PUT';
  url: string;
  objectKey: string;
  headers?: Record<string, string>;
};

type SignedUploadResponse = {
  file: FileMetadataResponse;
  upload: SignedStorageUrlResponse;
};

type SignedDownloadResponse = {
  download: SignedStorageUrlResponse;
};

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const originalSigningKey = process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY;
  const originalMetadataPath = process.env.FILE_METADATA_PATH;
  const originalObjectStoragePath = process.env.FILE_OBJECT_STORAGE_PATH;
  const originalStorageDriver = process.env.STORAGE_DRIVER;
  const originalFileStoragePublicUrl = process.env.FILE_STORAGE_PUBLIC_URL;
  const originalAllowedOrigins = process.env.FILE_STORAGE_ALLOWED_ORIGINS;
  const originalLocalStorageSigningSecret =
    process.env.LOCAL_STORAGE_SIGNING_SECRET;
  const metadataPath = `/tmp/commerce-os-file-storage-e2e-${process.pid}.json`;
  const objectStoragePath = `/tmp/commerce-os-file-storage-e2e-objects-${process.pid}`;

  beforeEach(async () => {
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = signingKey;
    process.env.FILE_METADATA_PATH = metadataPath;
    process.env.FILE_OBJECT_STORAGE_PATH = objectStoragePath;
    process.env.STORAGE_DRIVER = 'local-disk';
    process.env.FILE_STORAGE_PUBLIC_URL = 'http://files.e2e.test';
    process.env.FILE_STORAGE_ALLOWED_ORIGINS =
      'https://admin.zayos.com.mm,https://zayos.com.mm';
    process.env.LOCAL_STORAGE_SIGNING_SECRET =
      'test-local-storage-signing-secret-123!';
    rmSync(metadataPath, { force: true });
    rmSync(objectStoragePath, { force: true, recursive: true });
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(
      '/files/:id/content',
      raw({ type: '*/*', limit: process.env.MAX_FILE_SIZE || '10mb' }),
    );
    app.enableCors(getFileStorageCorsOptions());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(() => {
    if (originalSigningKey === undefined)
      delete process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY;
    else process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = originalSigningKey;
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
    if (originalAllowedOrigins === undefined)
      delete process.env.FILE_STORAGE_ALLOWED_ORIGINS;
    else process.env.FILE_STORAGE_ALLOWED_ORIGINS = originalAllowedOrigins;
    if (originalLocalStorageSigningSecret === undefined)
      delete process.env.LOCAL_STORAGE_SIGNING_SECRET;
    else
      process.env.LOCAL_STORAGE_SIGNING_SECRET =
        originalLocalStorageSigningSecret;
    rmSync(metadataPath, { force: true });
    rmSync(objectStoragePath, { force: true, recursive: true });
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          service: 'file-storage-service',
          status: 'ok',
        });
      });
  });

  it('/files/metadata (POST)', async () => {
    const response = await request(app.getHttpServer())
      .post('/files/metadata')
      .set('Authorization', authHeader())
      .set('x-tenant-id', 'tenant-1')
      .send({
        tenantId: 'tenant-2',
        fileName: 'receipt.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1200,
        purpose: 'payment-proof',
      })
      .expect(201);
    const body = response.body as unknown as FileMetadataResponse;

    expect(body).toMatchObject({
      tenantId: 'tenant-1',
      fileName: 'receipt.jpg',
      status: 'registered',
    });

    return request(app.getHttpServer())
      .get(`/files/${body.id}`)
      .set('Authorization', authHeader())
      .set('x-tenant-id', 'tenant-1')
      .expect(200)
      .expect(({ body: readBody }) => {
        expect(readBody).toEqual(body);
      });
  });

  it('prevents cross-tenant metadata reads', async () => {
    const response = await request(app.getHttpServer())
      .post('/files/metadata')
      .set('Authorization', authHeader())
      .set('x-tenant-id', 'tenant-1')
      .send({
        fileName: 'private.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 100,
      })
      .expect(201);
    const body = response.body as unknown as FileMetadataResponse;

    return request(app.getHttpServer())
      .get(`/files/${body.id}`)
      .set('Authorization', authHeader())
      .set('x-tenant-id', 'tenant-2')
      .expect(200)
      .expect({ id: body.id, status: 'not_found' });
  });

  it('/files/uploads (POST) issues tenant-scoped signed upload and download URLs', async () => {
    const response = await request(app.getHttpServer())
      .post('/files/uploads')
      .set('Authorization', authHeader())
      .set('x-tenant-id', 'tenant-1')
      .send({
        tenantId: 'tenant-2',
        fileName: 'note.txt',
        contentType: 'text/plain',
        sizeBytes: 11,
      })
      .expect(201);
    const body = response.body as unknown as SignedUploadResponse;

    expect(body.file).toMatchObject({
      tenantId: 'tenant-1',
      fileName: 'note.txt',
      storageDriver: 'local-disk',
      status: 'registered',
    });
    expect(body.upload).toMatchObject({
      driver: 'local-disk',
      method: 'PUT',
      objectKey: body.file.objectKey,
      headers: { 'content-type': 'text/plain' },
    });
    expect(new URL(body.upload.url).origin).toBe('http://files.e2e.test');

    await request(app.getHttpServer())
      .get(`/files/${body.file.id}/download-url`)
      .set('Authorization', authHeader())
      .set('x-tenant-id', 'tenant-2')
      .expect(200)
      .expect({ id: body.file.id, status: 'not_found' });

    const downloadResponse = await request(app.getHttpServer())
      .get(`/files/${body.file.id}/download-url`)
      .set('Authorization', authHeader())
      .set('x-tenant-id', 'tenant-1')
      .expect(200);
    const downloadBody =
      downloadResponse.body as unknown as SignedDownloadResponse;

    expect(downloadBody.download).toMatchObject({
      driver: 'local-disk',
      method: 'GET',
      objectKey: body.file.objectKey,
    });
    expect(new URL(downloadBody.download.url).origin).toBe(
      'http://files.e2e.test',
    );
  });

  it('allows signed browser PUT and GET requests with explicit CORS preflight', async () => {
    const uploadResponse = await request(app.getHttpServer())
      .post('/files/uploads')
      .set('Authorization', authHeader())
      .set('x-tenant-id', 'tenant-1')
      .send({
        fileName: 'icon.png',
        contentType: 'image/png',
        sizeBytes: 4,
      })
      .expect(201);
    const upload = uploadResponse.body as SignedUploadResponse;
    const uploadUrl = new URL(upload.upload.url);
    const uploadPath = `${uploadUrl.pathname}${uploadUrl.search}`;

    await request(app.getHttpServer())
      .options(uploadPath)
      .set('Origin', 'https://admin.zayos.com.mm')
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'Content-Type')
      .expect(204)
      .expect('access-control-allow-origin', 'https://admin.zayos.com.mm')
      .expect('access-control-allow-methods', 'GET,PUT,OPTIONS')
      .expect('access-control-allow-headers', 'Content-Type');

    await request(app.getHttpServer())
      .put(uploadPath)
      .set('Origin', 'https://admin.zayos.com.mm')
      .set('Content-Type', 'image/png')
      .send(Buffer.from([1, 2, 3, 4]))
      .expect(200)
      .expect('access-control-allow-origin', 'https://admin.zayos.com.mm');

    const downloadResponse = await request(app.getHttpServer())
      .get(`/files/${upload.file.id}/download-url`)
      .set('Authorization', authHeader())
      .set('x-tenant-id', 'tenant-1')
      .expect(200);
    const download = downloadResponse.body as SignedDownloadResponse;
    const downloadUrl = new URL(download.download.url);
    const downloadPath = `${downloadUrl.pathname}${downloadUrl.search}`;

    await request(app.getHttpServer())
      .get(downloadPath)
      .set('Origin', 'https://zayos.com.mm')
      .expect(200)
      .expect('access-control-allow-origin', 'https://zayos.com.mm');
  });

  it('does not grant CORS access to an unallowlisted origin', async () => {
    await request(app.getHttpServer())
      .options(
        '/files/file-1/content?tenantId=tenant-1&expires=1&signature=sig',
      )
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'Content-Type')
      .expect(204)
      .expect((response) => {
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
      });
  });
});

const signingKey = 'test-internal-service-token-signing-key-32-chars';

function authHeader() {
  return `Bearer ${signServiceToken({
    signingKey,
    subject: SERVICE_IDENTITIES.CORE,
    audience: SERVICE_IDENTITIES.FILE_STORAGE,
    scopes: [
      SERVICE_SCOPES.FILE_METADATA_WRITE,
      SERVICE_SCOPES.FILE_READ,
      SERVICE_SCOPES.FILE_WRITE,
    ],
  })}`;
}
