import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { rmSync } from 'fs';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

type MediaJobResponse = {
  id: string;
  tenantId: string;
  fileId: string;
  jobType: string;
  status: string;
  attempts: number;
  outputs: Array<Record<string, unknown>>;
};

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const originalStorePath = process.env.MEDIA_JOB_STORE_PATH;
  const originalWorkerEnabled = process.env.MEDIA_WORKER_ENABLED;
  const originalRetryDelay = process.env.MEDIA_JOB_RETRY_BASE_DELAY_MS;
  const originalMaxAttempts = process.env.MEDIA_JOB_MAX_ATTEMPTS;
  const originalFileStorageUrl = process.env.FILE_STORAGE_URL;
  const originalCoreApiUrl = process.env.CORE_API_URL;
  const originalCallbackUrl = process.env.MEDIA_STATUS_CALLBACK_URL;
  const originalImageMode = process.env.MEDIA_IMAGE_PROCESSING_MODE;
  const storePath = `/tmp/commerce-os-media-jobs-e2e-${process.pid}.json`;

  beforeEach(async () => {
    process.env.MEDIA_JOB_STORE_PATH = storePath;
    process.env.MEDIA_WORKER_ENABLED = 'false';
    process.env.MEDIA_JOB_RETRY_BASE_DELAY_MS = '0';
    process.env.MEDIA_JOB_MAX_ATTEMPTS = '3';
    process.env.FILE_STORAGE_URL = 'http://file-storage.e2e.test';
    process.env.MEDIA_IMAGE_PROCESSING_MODE = 'placeholder';
    delete process.env.CORE_API_URL;
    delete process.env.MEDIA_STATUS_CALLBACK_URL;
    rmSync(storePath, { force: true });

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
    rmSync(storePath, { force: true });
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          service: 'media-processing-service',
          status: 'ok',
        });
      });
  });

  it('/media/jobs (POST)', async () => {
    const response = await request(app.getHttpServer())
      .post('/media/jobs')
      .send({
        tenantId: 'tenant-1',
        fileId: 'file-1',
        jobType: 'thumbnail',
      })
      .expect(201);
    const body = response.body as unknown as MediaJobResponse;

    expect(body).toMatchObject({
      tenantId: 'tenant-1',
      fileId: 'file-1',
      jobType: 'thumbnail',
      status: 'queued',
    });

    return request(app.getHttpServer())
      .get(`/media/jobs/${body.id}`)
      .expect(200)
      .expect(({ body: readBody }) => {
        expect(readBody).toEqual(body);
      });
  });

  it('/media/jobs/:id/process (POST)', async () => {
    const response = await request(app.getHttpServer())
      .post('/media/jobs')
      .send({
        tenantId: 'tenant-1',
        fileId: 'file-1',
        jobType: 'optimize',
        options: { quality: 76 },
      })
      .expect(201);
    const body = response.body as unknown as MediaJobResponse;

    const processedResponse = await request(app.getHttpServer())
      .post(`/media/jobs/${body.id}/process`)
      .expect(201);
    const processed = processedResponse.body as unknown as MediaJobResponse;

    expect(processed).toMatchObject({
      id: body.id,
      status: 'completed',
      attempts: 1,
      outputs: [
        {
          type: 'optimized-image',
          sourceFileId: 'file-1',
          fileId: 'file-1:optimized',
          status: 'placeholder',
          metadata: {
            quality: 76,
            binaryGenerationPending: true,
          },
        },
      ],
    });
  });

  it('/media/jobs/drain (POST) retries queued jobs', async () => {
    const response = await request(app.getHttpServer())
      .post('/media/jobs')
      .send({
        tenantId: 'tenant-1',
        fileId: 'file-1',
        jobType: 'scan',
        options: { failAttempts: 1 },
      })
      .expect(201);
    const body = response.body as unknown as MediaJobResponse;

    await request(app.getHttpServer()).post('/media/jobs/drain').expect(201);

    return request(app.getHttpServer())
      .get(`/media/jobs/${body.id}`)
      .expect(200)
      .expect(({ body: readBody }) => {
        expect(readBody).toMatchObject({
          id: body.id,
          status: 'completed',
          attempts: 2,
        });
      });
  });
});
