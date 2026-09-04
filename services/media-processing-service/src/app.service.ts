import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  SERVICE_IDENTITIES,
  SERVICE_SCOPES,
  serviceAuthHeaders,
} from '@zayos/internal-service-auth';
import { createRequire } from 'module';
import {
  MediaJobInput,
  MediaJobOutput,
  MediaJobRecord,
  MediaJobStatus,
  MediaJobStore,
  MediaJobType,
} from './media-job.store';
import { HttpFileScanningClient, HttpTranscriptionClient } from './media-provider.client';

type SharpPipeline = {
  rotate(): SharpPipeline;
  resize(options: Record<string, unknown>): SharpPipeline;
  webp(options: { quality: number }): SharpPipeline;
  metadata(): Promise<{ width?: number; height?: number }>;
  toBuffer(): Promise<Buffer>;
};

type SharpFactory = (input: Buffer) => SharpPipeline;

const sharp = createRequire(__filename)('sharp') as SharpFactory;

type CallbackResult = {
  status: MediaJobRecord['callbackStatus'];
  attempts: number;
  lastError?: string;
};

type FileStorageRecord = {
  id: string;
  tenantId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: string;
};

type SignedFileUrl = {
  driver: string;
  method: 'GET' | 'PUT';
  url: string;
  objectKey: string;
  expiresAt: string;
  headers?: Record<string, string>;
};

type SignedDownloadResponse = {
  file: FileStorageRecord;
  download: SignedFileUrl;
};

type SignedUploadResponse = {
  file: FileStorageRecord;
  upload: SignedFileUrl;
};

type SourceFile = {
  file: FileStorageRecord;
  content: Buffer;
};

@Injectable()
export class AppService implements OnModuleInit, OnModuleDestroy {
  private readonly store = new MediaJobStore();
  private readonly maxAttempts = Number(
    process.env.MEDIA_JOB_MAX_ATTEMPTS || 3,
  );
  private readonly retryBaseDelayMs = Number(
    process.env.MEDIA_JOB_RETRY_BASE_DELAY_MS || 250,
  );
  private readonly workerEnabled = process.env.MEDIA_WORKER_ENABLED === 'true';
  private readonly workerIntervalMs = Number(
    process.env.MEDIA_WORKER_INTERVAL_MS || 1000,
  );
  private workerTimer?: NodeJS.Timeout;
  private workerRunning = false;
  private readonly scanningClient = new HttpFileScanningClient();
  private readonly transcriptionClient = new HttpTranscriptionClient();

  onModuleInit() {
    if (!this.workerEnabled) return;
    this.workerTimer = setInterval(() => {
      void this.drainQueue();
    }, this.workerIntervalMs);
    void this.drainQueue();
  }

  onModuleDestroy() {
    if (this.workerTimer) clearInterval(this.workerTimer);
  }

  getHealth() {
    return {
      service: 'media-processing-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  getReadiness() {
    const dependencies = {
      fileStorage: Boolean(process.env.FILE_STORAGE_URL),
      jobStore: true,
    };
    return {
      service: 'media-processing-service',
      ready: Object.values(dependencies).every(Boolean),
      timestamp: new Date().toISOString(),
    };
  }

  getMetrics() {
    const memory = process.memoryUsage();
    const counts = this.store.countsByStatus();
    return {
      service: 'media-processing-service',
      uptimeSeconds: process.uptime(),
      memoryBytes: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
      },
      queue: {
        backend: process.env.MEDIA_QUEUE_BACKEND || 'local-json',
        workerEnabled: this.workerEnabled,
        workerRunning: this.workerRunning,
        retryBaseDelayMs: this.retryBaseDelayMs,
        maxAttempts: this.maxAttempts,
      },
      mediaJobs: counts,
      timestamp: new Date().toISOString(),
    };
  }

  createJob(input: MediaJobInput) {
    this.validateJob(input);
    const now = new Date().toISOString();
    const job = this.store.save({
      ...input,
      id: `media-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'queued',
      attempts: 0,
      maxAttempts: this.maxAttempts,
      createdAt: now,
      updatedAt: now,
      outputs: [],
      callbackAttempts: 0,
      callbackStatus: 'pending',
    });

    if (this.workerEnabled) {
      void this.drainQueue();
    }

    return job;
  }

  getJob(id: string) {
    return (
      this.store.get(id) || {
        id,
        status: 'not_found',
      }
    );
  }

  listJobs(status?: MediaJobStatus) {
    const jobs = this.store.list();
    return status ? jobs.filter((job) => job.status === status) : jobs;
  }

  async processJob(id: string) {
    const job = this.store.get(id);
    if (!job) return { id, status: 'not_found' };
    if (job.status === 'completed' || job.status === 'failed') return job;
    return this.processQueuedJob(job);
  }

  async drainQueue() {
    if (this.workerRunning) {
      return { accepted: true, workerRunning: true };
    }

    this.workerRunning = true;
    let processed = 0;
    try {
      let nextJob = this.store.nextQueuedJob();
      while (nextJob) {
        await this.processQueuedJob(nextJob);
        processed += 1;
        nextJob = this.store.nextQueuedJob();
      }
      return { accepted: true, processed };
    } finally {
      this.workerRunning = false;
    }
  }

  private async processQueuedJob(job: MediaJobRecord) {
    const processingJob = await this.transition(job, 'processing', {
      attempts: job.attempts + 1,
      startedAt: new Date().toISOString(),
      nextAttemptAt: undefined,
    });

    try {
      this.maybeFailForTest(processingJob);
      const completed = await this.transition(processingJob, 'completed', {
        outputs: await this.createOutputs(processingJob),
        completedAt: new Date().toISOString(),
        lastError: undefined,
      });
      return completed;
    } catch (error) {
      const lastError = error instanceof Error ? error.message : String(error);
      if (processingJob.attempts >= processingJob.maxAttempts) {
        return this.transition(processingJob, 'failed', {
          failedAt: new Date().toISOString(),
          lastError,
        });
      }

      const retryAt = new Date(
        Date.now() + this.retryBaseDelayMs * processingJob.attempts,
      ).toISOString();
      const retryJob = this.store.save({
        ...processingJob,
        status: 'queued',
        updatedAt: new Date().toISOString(),
        lastError,
        nextAttemptAt: retryAt,
      });
      await this.sendStatusCallback(retryJob);
      return retryJob;
    }
  }

  private async transition(
    job: MediaJobRecord,
    status: MediaJobStatus,
    updates: Partial<MediaJobRecord> = {},
  ) {
    const transitioned = this.store.save({
      ...job,
      ...updates,
      status,
      updatedAt: new Date().toISOString(),
    });
    const callback = await this.sendStatusCallback(transitioned);
    return this.store.save({
      ...transitioned,
      callbackAttempts: callback.attempts,
      callbackStatus: callback.status,
      callbackLastError: callback.lastError,
      callbackUpdatedAt: new Date().toISOString(),
    });
  }

  private async createOutputs(job: MediaJobRecord): Promise<MediaJobOutput[]> {
    const createdAt = new Date().toISOString();
    switch (job.jobType) {
      case 'thumbnail':
        return [await this.createThumbnailOutput(job, createdAt)];
      case 'optimize':
        return [await this.createOptimizedImageOutput(job, createdAt)];
      case 'scan':
        return [await this.createScanOutput(job, createdAt)];
      case 'transcribe':
        return [await this.createTranscriptionOutput(job, createdAt)];
    }
  }

  private async createScanOutput(job: MediaJobRecord, createdAt: string): Promise<MediaJobOutput> {
    const provider = String(process.env.FILE_SCANNING_PROVIDER || 'placeholder');
    if (provider === 'placeholder') {
      return { type: 'file-scan', sourceFileId: job.fileId, provider, status: 'placeholder', metadata: { verdict: 'not_scanned', providerConfigured: false, blocking: false }, createdAt };
    }
    if (provider !== 'http') throw new Error(`Unsupported file scanning provider: ${provider}`);
    const source = await this.fetchSourceFile(job);
    const result = await this.scanningClient.scan({ ...source.file, content: source.content });
    return {
      type: 'file-scan', sourceFileId: job.fileId, provider, status: 'generated',
      metadata: { verdict: result.verdict, threats: result.threats || [], engineVersion: result.engineVersion, blocking: result.verdict === 'infected' }, createdAt,
    };
  }

  private async createTranscriptionOutput(job: MediaJobRecord, createdAt: string): Promise<MediaJobOutput> {
    const provider = String(process.env.TRANSCRIPTION_PROVIDER || 'placeholder');
    const language = this.stringOption(job.options, 'language', 'auto');
    if (provider === 'placeholder') {
      return { type: 'transcription', sourceFileId: job.fileId, provider, status: 'placeholder', metadata: { transcript: null, providerConfigured: false, language }, createdAt };
    }
    if (provider !== 'http') throw new Error(`Unsupported transcription provider: ${provider}`);
    const source = await this.fetchSourceFile(job);
    if (!source.file.contentType.startsWith('audio/') && !source.file.contentType.startsWith('video/')) {
      throw new Error(`Transcription requires audio or video, received ${source.file.contentType}`);
    }
    const result = await this.transcriptionClient.transcribe({ ...source.file, content: source.content }, { ...job.options, language });
    return {
      type: 'transcription', sourceFileId: job.fileId, provider, status: 'generated',
      metadata: { transcript: result.transcript, language: result.language || language, durationSeconds: result.durationSeconds, segments: result.segments }, createdAt,
    };
  }

  private async createThumbnailOutput(
    job: MediaJobRecord,
    createdAt: string,
  ): Promise<MediaJobOutput> {
    const width = this.clampedNumberOption(job.options, 'width', 320, 1, 2048);
    const height = this.clampedNumberOption(
      job.options,
      'height',
      320,
      1,
      2048,
    );
    if (this.imageProcessingMode() === 'placeholder') {
      return this.placeholderImageOutput(job, 'thumbnail', createdAt, {
        width,
        height,
      });
    }

    const source = await this.fetchSourceFile(job);
    this.assertImageFile(source.file);
    const content = await sharp(source.content)
      .rotate()
      .resize({ width, height, fit: 'inside', withoutEnlargement: true })
      .webp({
        quality: this.clampedNumberOption(job.options, 'quality', 80, 1, 100),
      })
      .toBuffer();
    const metadata = await sharp(content).metadata();
    const uploaded = await this.uploadDerivedFile(job, source.file, {
      content,
      contentType: 'image/webp',
      purpose: 'media-thumbnail',
      fileName: this.derivedFileName(source.file.fileName, 'thumbnail', 'webp'),
      metadata: {
        width: metadata.width,
        height: metadata.height,
      },
    });

    return {
      type: 'thumbnail',
      sourceFileId: job.fileId,
      fileId: uploaded.file.id,
      status: 'generated',
      metadata: {
        strategy: 'sharp',
        contentType: uploaded.file.contentType,
        sizeBytes: uploaded.file.sizeBytes,
        width: metadata.width,
        height: metadata.height,
        sourceContentType: source.file.contentType,
      },
      createdAt,
    };
  }

  private async createOptimizedImageOutput(
    job: MediaJobRecord,
    createdAt: string,
  ): Promise<MediaJobOutput> {
    const quality = this.clampedNumberOption(
      job.options,
      'quality',
      82,
      1,
      100,
    );
    if (this.imageProcessingMode() === 'placeholder') {
      return this.placeholderImageOutput(job, 'optimized-image', createdAt, {
        quality,
      });
    }

    const source = await this.fetchSourceFile(job);
    this.assertImageFile(source.file);
    const content = await sharp(source.content)
      .rotate()
      .webp({ quality })
      .toBuffer();
    const metadata = await sharp(content).metadata();
    const uploaded = await this.uploadDerivedFile(job, source.file, {
      content,
      contentType: 'image/webp',
      purpose: 'media-optimized-image',
      fileName: this.derivedFileName(source.file.fileName, 'optimized', 'webp'),
      metadata: {
        width: metadata.width,
        height: metadata.height,
      },
    });

    return {
      type: 'optimized-image',
      sourceFileId: job.fileId,
      fileId: uploaded.file.id,
      status: 'generated',
      metadata: {
        strategy: 'sharp',
        contentType: uploaded.file.contentType,
        sizeBytes: uploaded.file.sizeBytes,
        width: metadata.width,
        height: metadata.height,
        quality,
        sourceContentType: source.file.contentType,
        sourceSizeBytes: source.file.sizeBytes,
      },
      createdAt,
    };
  }

  private placeholderImageOutput(
    job: MediaJobRecord,
    type: 'thumbnail' | 'optimized-image',
    createdAt: string,
    metadata: Record<string, unknown>,
  ): MediaJobOutput {
    return {
      type,
      sourceFileId: job.fileId,
      fileId: `${job.fileId}:${type === 'thumbnail' ? 'thumbnail' : 'optimized'}`,
      status: 'placeholder',
      metadata: {
        strategy: 'placeholder',
        ...metadata,
        binaryGenerationPending: true,
      },
      createdAt,
    };
  }

  private async fetchSourceFile(job: MediaJobRecord): Promise<SourceFile> {
    const fileStorageUrl = this.fileStorageUrl();
    const headers = this.internalHeaders(job.tenantId);
    const fileResponse = await fetch(
      `${fileStorageUrl}/files/${encodeURIComponent(job.fileId)}`,
      { headers },
    );
    if (!fileResponse.ok) {
      throw new Error(
        `File metadata lookup failed with ${fileResponse.status}`,
      );
    }
    const file = (await fileResponse.json()) as FileStorageRecord;
    if (file.status === 'not_found' || file.status === 'archived') {
      throw new Error(`Source file is ${file.status}`);
    }

    const downloadResponse = await fetch(
      `${fileStorageUrl}/files/${encodeURIComponent(job.fileId)}/download-url`,
      { headers },
    );
    if (!downloadResponse.ok) {
      throw new Error(
        `File download URL lookup failed with ${downloadResponse.status}`,
      );
    }
    const download = (await downloadResponse.json()) as SignedDownloadResponse;
    const contentResponse = await fetch(
      this.serviceReachableUrl(download.download),
      {
        headers: download.download.headers,
      },
    );
    if (!contentResponse.ok) {
      throw new Error(`File download failed with ${contentResponse.status}`);
    }

    return {
      file,
      content: Buffer.from(await contentResponse.arrayBuffer()),
    };
  }

  private async uploadDerivedFile(
    job: MediaJobRecord,
    source: FileStorageRecord,
    output: {
      content: Buffer;
      contentType: string;
      purpose: string;
      fileName: string;
      metadata: Record<string, unknown>;
    },
  ) {
    const fileStorageUrl = this.fileStorageUrl();
    const headers = this.internalHeaders(job.tenantId);
    const uploadResponse = await fetch(`${fileStorageUrl}/files/uploads`, {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        fileName: output.fileName,
        contentType: output.contentType,
        sizeBytes: output.content.length,
        purpose: output.purpose,
        metadata: {
          ...output.metadata,
          sourceFileId: source.id,
          sourceFileName: source.fileName,
          mediaJobId: job.id,
          mediaJobType: job.jobType,
        },
      }),
    });
    if (!uploadResponse.ok) {
      throw new Error(
        `Derived file registration failed with ${uploadResponse.status}`,
      );
    }

    const signedUpload = (await uploadResponse.json()) as SignedUploadResponse;
    const contentResponse = await fetch(
      this.serviceReachableUrl(signedUpload.upload),
      {
        method: signedUpload.upload.method,
        headers: signedUpload.upload.headers,
        body: output.content as unknown as BodyInit,
      },
    );
    if (!contentResponse.ok) {
      throw new Error(
        `Derived file upload failed with ${contentResponse.status}`,
      );
    }

    return signedUpload;
  }

  private async sendStatusCallback(
    job: MediaJobRecord,
  ): Promise<CallbackResult> {
    const endpoint = this.callbackEndpoint();
    if (!endpoint) {
      return { status: 'skipped', attempts: job.callbackAttempts };
    }

    const attempts = job.callbackAttempts + 1;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...serviceAuthHeaders({
            audience: SERVICE_IDENTITIES.CORE,
            subject: SERVICE_IDENTITIES.MEDIA_PROCESSING,
            scopes: [SERVICE_SCOPES.MEDIA_CALLBACK_SUBMIT],
          }),
        },
        body: JSON.stringify({
          id: job.id,
          tenantId: job.tenantId,
          fileId: job.fileId,
          jobType: job.jobType,
          status: job.status,
          attempts: job.attempts,
          outputs: job.outputs,
          lastError: job.lastError,
          updatedAt: job.updatedAt,
        }),
      });
      if (!response.ok) {
        throw new Error(`Core callback failed with ${response.status}`);
      }
      return { status: 'sent', attempts };
    } catch (error) {
      return {
        status: 'failed',
        attempts,
        lastError: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private callbackEndpoint() {
    if (process.env.MEDIA_STATUS_CALLBACK_URL)
      return process.env.MEDIA_STATUS_CALLBACK_URL;
    if (!process.env.CORE_API_URL) return undefined;
    return `${process.env.CORE_API_URL.replace(/\/$/, '')}/internal/media-jobs/status`;
  }

  private validateJob(input: MediaJobInput) {
    if (!input.tenantId) throw new BadRequestException('tenantId is required');
    if (!input.fileId) throw new BadRequestException('fileId is required');
    if (!this.isJobType(input.jobType)) {
      throw new BadRequestException('Unsupported media job type');
    }
  }

  private isJobType(value: string): value is MediaJobType {
    return ['thumbnail', 'optimize', 'scan', 'transcribe'].includes(value);
  }

  private numberOption(
    options: Record<string, unknown> | undefined,
    key: string,
    fallback: number,
  ) {
    const value = Number(options?.[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  private clampedNumberOption(
    options: Record<string, unknown> | undefined,
    key: string,
    fallback: number,
    min: number,
    max: number,
  ) {
    const value = this.numberOption(options, key, fallback);
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  private stringOption(
    options: Record<string, unknown> | undefined,
    key: string,
    fallback: string,
  ) {
    const value = options?.[key];
    return typeof value === 'string' && value.trim() ? value : fallback;
  }

  private fileStorageUrl() {
    const fileStorageUrl = process.env.FILE_STORAGE_URL;
    if (!fileStorageUrl) {
      throw new Error('FILE_STORAGE_URL is required for image processing');
    }
    return fileStorageUrl.replace(/\/$/, '');
  }

  private internalHeaders(tenantId: string) {
    return {
      'x-tenant-id': tenantId,
      ...serviceAuthHeaders({
        audience: SERVICE_IDENTITIES.FILE_STORAGE,
        subject: SERVICE_IDENTITIES.MEDIA_PROCESSING,
        scopes: [SERVICE_SCOPES.FILE_READ, SERVICE_SCOPES.FILE_METADATA_WRITE, SERVICE_SCOPES.FILE_WRITE],
      }),
    };
  }

  private serviceReachableUrl(signedUrl: SignedFileUrl) {
    if (signedUrl.driver !== 'local-disk') return signedUrl.url;

    const serviceBase = process.env.FILE_STORAGE_URL;
    if (!serviceBase) return signedUrl.url;

    const url = new URL(signedUrl.url);
    const base = new URL(serviceBase);
    url.protocol = base.protocol;
    url.hostname = base.hostname;
    url.port = base.port;
    return url.toString();
  }

  private assertImageFile(file: FileStorageRecord) {
    if (!file.contentType.startsWith('image/')) {
      throw new Error(`Source file is not an image: ${file.contentType}`);
    }
  }

  private derivedFileName(fileName: string, suffix: string, extension: string) {
    const baseName = fileName.replace(/\.[^.]+$/, '') || 'file';
    return `${baseName}-${suffix}.${extension}`;
  }

  private imageProcessingMode() {
    return process.env.MEDIA_IMAGE_PROCESSING_MODE || 'sharp';
  }

  private maybeFailForTest(job: MediaJobRecord) {
    if (job.options?.forceFailure === true) {
      throw new Error('Forced media job failure');
    }
    const failAttempts = Number(job.options?.failAttempts || 0);
    if (Number.isFinite(failAttempts) && job.attempts <= failAttempts) {
      throw new Error(`Forced media job retry ${job.attempts}`);
    }
  }
}
