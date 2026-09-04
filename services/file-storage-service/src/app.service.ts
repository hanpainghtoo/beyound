import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { FileRecord, FileStorageAdapter } from './file-storage.adapter';
import { LocalDiskStorageAdapter } from './local-disk-storage.adapter';
import { S3CompatibleStorageAdapter } from './s3-compatible-storage.adapter';
import { StorageCapacityReservation } from './storage-capacity-reservation';

type FileMetadataInput = {
  ownerId?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  purpose?: string;
  metadata?: Record<string, unknown>;
  storageCapacity?: {
    periodId?: string | null;
    limitGb?: number | null;
  };
};

@Injectable()
export class AppService implements OnApplicationShutdown {
  private readonly storage: FileStorageAdapter;
  private readonly capacityReservation = new StorageCapacityReservation();

  constructor() {
    this.storage = this.createStorageAdapter();
  }

  getHealth() {
    return {
      service: 'file-storage-service',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    const reservationReady = await this.capacityReservation.checkReady();
    return {
      service: 'file-storage-service',
      ready: Boolean(this.storage.driver) && reservationReady,
      dependencies: { storage: Boolean(this.storage.driver), reservationReady },
      timestamp: new Date().toISOString(),
    };
  }

  async onApplicationShutdown() {
    await this.capacityReservation.close();
  }

  getMetrics() {
    const memory = process.memoryUsage();
    return {
      service: 'file-storage-service',
      uptimeSeconds: process.uptime(),
      memoryBytes: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
      },
      registeredFiles: this.storage.count(),
      timestamp: new Date().toISOString(),
    };
  }

  registerFile(tenantId: string, input: FileMetadataInput) {
    this.validateFile(input);
    const id = this.createFileId();
    const file: FileRecord = {
      ...input,
      tenantId,
      id,
      storageDriver: this.storage.driver,
      objectKey: this.storage.buildObjectKey({
        tenantId,
        id,
        fileName: input.fileName,
      }),
      status: 'registered',
      createdAt: new Date().toISOString(),
    };
    return this.storage.save(file);
  }

  async createSignedUpload(tenantId: string, input: FileMetadataInput) {
    return this.capacityReservation.run(tenantId, async (assertLease) => {
      this.assertStorageCapacity(tenantId, input);
      await assertLease();
      const file = this.registerFile(tenantId, input);
      return {
        file,
        upload: this.storage.createSignedUploadUrl(file, {
          baseUrl: this.fileStoragePublicUrl(),
          expiresInSeconds: this.signedUrlTtlSeconds(),
        }),
      };
    });
  }

  getFile(tenantId: string, id: string) {
    const file = this.storage.get(id);
    if (!file || file.tenantId !== tenantId) {
      return { id, status: 'not_found' };
    }
    return file;
  }

  listFiles(
    tenantId: string,
    options: {
      search?: string;
      purpose?: string;
      contentType?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const search = String(options.search || '')
      .trim()
      .toLowerCase();
    const purpose = String(options.purpose || '')
      .trim()
      .toLowerCase();
    const contentType = String(options.contentType || '')
      .trim()
      .toLowerCase();
    const page = Math.max(1, Math.floor(Number(options.page) || 1));
    const limit = Math.min(
      100,
      Math.max(1, Math.floor(Number(options.limit) || 50)),
    );

    const files = this.storage
      .list()
      .filter(
        (file) => file.tenantId === tenantId && file.status !== 'archived',
      )
      .filter(
        (file) =>
          !search ||
          file.fileName.toLowerCase().includes(search) ||
          JSON.stringify(file.metadata?.tags || '')
            .toLowerCase()
            .includes(search),
      )
      .filter(
        (file) =>
          !purpose || String(file.purpose || '').toLowerCase() === purpose,
      )
      .filter(
        (file) =>
          !contentType ||
          file.contentType.toLowerCase().startsWith(contentType),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const total = files.length;
    const data = files.slice((page - 1) * limit, page * limit).map((file) => ({
      ...file,
      download:
        file.uploadedAt && file.status !== 'archived'
          ? this.storage.createSignedDownloadUrl(file, {
              baseUrl: this.fileStoragePublicUrl(),
              expiresInSeconds: this.signedUrlTtlSeconds(),
            })
          : undefined,
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };
  }

  archiveFile(tenantId: string, id: string) {
    const file = this.storage.get(id);
    if (!file || file.tenantId !== tenantId) {
      return { id, status: 'not_found' };
    }
    return this.storage.archive(id)!;
  }

  getSignedDownload(tenantId: string, id: string) {
    const file = this.storage.get(id);
    if (!file || file.tenantId !== tenantId) {
      return { id, status: 'not_found' };
    }
    if (file.status === 'archived') {
      return { id, status: 'archived' };
    }

    return {
      file,
      download: this.storage.createSignedDownloadUrl(file, {
        baseUrl: this.fileStoragePublicUrl(),
        expiresInSeconds: this.signedUrlTtlSeconds(),
      }),
    };
  }

  writeFileContent(
    id: string,
    tenantId: string,
    expires: string,
    signature: string,
    content: Buffer,
  ) {
    const file = this.getSignedFile('PUT', id, tenantId, expires, signature);
    if (!this.storage.writeObject) {
      throw new BadRequestException(
        'Direct file uploads are not supported by the active storage driver',
      );
    }
    if (!Buffer.isBuffer(content) || content.length === 0) {
      throw new BadRequestException('File content is required');
    }
    if (content.length !== file.sizeBytes) {
      throw new BadRequestException(
        `Uploaded content must be exactly ${file.sizeBytes} bytes`,
      );
    }

    this.storage.writeObject(file, content);
    const uploadedAt = new Date().toISOString();
    this.storage.save({ ...file, uploadedAt });
    return {
      id: file.id,
      status: 'uploaded',
      sizeBytes: content.length,
      uploadedAt,
    };
  }

  readFileContent(
    id: string,
    tenantId: string,
    expires: string,
    signature: string,
  ) {
    const file = this.getSignedFile('GET', id, tenantId, expires, signature);
    if (!this.storage.readObject) {
      throw new BadRequestException(
        'Direct file downloads are not supported by the active storage driver',
      );
    }

    const content = this.storage.readObject(file);
    if (!content) {
      throw new NotFoundException('File content is not available');
    }
    return { file, content };
  }

  private assertStorageCapacity(tenantId: string, input: FileMetadataInput) {
    const limitGb = input.storageCapacity?.limitGb;
    if (limitGb === null || limitGb === undefined) return;
    if (!Number.isFinite(limitGb) || limitGb < 0) {
      throw new BadRequestException('Invalid storage capacity contract');
    }
    const usedBytes = this.storage
      .list()
      .filter(
        (file) => file.tenantId === tenantId && file.status !== 'archived',
      )
      .reduce((total, file) => total + Number(file.sizeBytes || 0), 0);
    const projectedBytes = usedBytes + Number(input.sizeBytes || 0);
    const limitBytes = limitGb * 1024 * 1024 * 1024;
    if (projectedBytes > limitBytes) {
      throw new ForbiddenException({
        code: 'STORAGE_LIMIT_REACHED_AT_STORAGE_BOUNDARY',
        message: 'Storage capacity was exceeded before upload registration.',
        usedBytes,
        incomingBytes: input.sizeBytes,
        projectedBytes,
        limitBytes,
        periodId: input.storageCapacity?.periodId || null,
      });
    }
  }

  private createStorageAdapter() {
    const storageDriver = process.env.STORAGE_DRIVER || 'local-disk';
    if (storageDriver === 's3' || storageDriver === 's3-compatible') {
      return new S3CompatibleStorageAdapter();
    }
    return new LocalDiskStorageAdapter();
  }

  private validateFile(input: FileMetadataInput) {
    const maxSize = Number(process.env.MAX_FILE_SIZE || 10 * 1024 * 1024);
    if (
      !Number.isFinite(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes > maxSize
    ) {
      throw new BadRequestException(
        `File size must be between 1 and ${maxSize} bytes`,
      );
    }

    const allowedTypes = new Set(
      (
        process.env.ALLOWED_FILE_CONTENT_TYPES ||
        'image/jpeg,image/png,image/webp,application/pdf,text/plain,audio/mpeg,video/mp4'
      )
        .split(',')
        .map((type) => type.trim())
        .filter(Boolean),
    );
    if (!allowedTypes.has(input.contentType)) {
      throw new BadRequestException(
        `Unsupported content type: ${input.contentType}`,
      );
    }
  }

  private createFileId() {
    return `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private signedUrlTtlSeconds() {
    const ttl = Number(process.env.SIGNED_URL_TTL_SECONDS || 900);
    if (!Number.isFinite(ttl) || ttl <= 0) return 900;
    return Math.min(Math.floor(ttl), 604800);
  }

  private fileStoragePublicUrl() {
    return (
      process.env.FILE_STORAGE_PUBLIC_URL ||
      process.env.FILE_STORAGE_URL ||
      undefined
    );
  }

  private getSignedFile(
    method: 'GET' | 'PUT',
    id: string,
    tenantId: string,
    expires: string,
    signature: string,
  ) {
    const file = this.storage.get(id);
    if (!file || file.tenantId !== tenantId || file.status === 'archived') {
      throw new NotFoundException('File is not available');
    }
    if (!this.storage.verifySignedUrl?.(method, file, expires, signature)) {
      throw new ForbiddenException('Invalid or expired file URL');
    }
    return file;
  }
}
