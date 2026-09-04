import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { rmSync } from 'fs';
import * as request from 'supertest';
import { App } from 'supertest/types';
import {
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  signServiceToken,
} from '@zayos/internal-service-auth';
import { AppModule } from './../src/app.module';

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
  const metadataPath = `/tmp/commerce-os-file-storage-e2e-${process.pid}.json`;
  const objectStoragePath = `/tmp/commerce-os-file-storage-e2e-objects-${process.pid}`;

  beforeEach(async () => {
    process.env.INTERNAL_SERVICE_TOKEN_SIGNING_KEY = signingKey;
    process.env.FILE_METADATA_PATH = metadataPath;
    process.env.FILE_OBJECT_STORAGE_PATH = objectStoragePath;
    process.env.STORAGE_DRIVER = 'local-disk';
    process.env.FILE_STORAGE_PUBLIC_URL = 'http://files.e2e.test';
    rmSync(metadataPath, { force: true });
    rmSync(objectStoragePath, { force: true, recursive: true });
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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
