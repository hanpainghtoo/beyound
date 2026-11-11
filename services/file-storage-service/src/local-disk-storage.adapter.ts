import { createHmac, timingSafeEqual } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs';
import { dirname, resolve } from 'path';
import type {
  FileRecord,
  FileStorageAdapter,
  ObjectKeyInput,
  SignedStorageUrl,
  SignedUrlOptions,
} from './file-storage.adapter';

const MINIMUM_SIGNING_SECRET_LENGTH = 32;
const placeholderSecrets = new Set([
  'commerce-os-local-file-storage-secret',
  'local-dev-change-me',
  'changeme',
  'change-me',
  'replace-me',
  'placeholder',
]);

export class LocalDiskStorageAdapter implements FileStorageAdapter {
  readonly driver = 'local-disk';
  private readonly metadataPath: string;
  private readonly objectRootPath: string;
  private readonly signingSecret: string;

  constructor(
    metadataPath = process.env.FILE_METADATA_PATH || '.data/file-metadata.json',
    objectRootPath = process.env.FILE_OBJECT_STORAGE_PATH || '.data/files',
  ) {
    this.metadataPath = resolve(metadataPath);
    this.objectRootPath = resolve(objectRootPath);
    this.signingSecret = this.resolveSigningSecret();
  }

  buildObjectKey(input: ObjectKeyInput) {
    return [
      'tenants',
      encodeURIComponent(input.tenantId),
      encodeURIComponent(input.id),
      this.safeFileName(input.fileName),
    ].join('/');
  }

  createSignedUploadUrl(
    file: FileRecord,
    options: SignedUrlOptions,
  ): SignedStorageUrl {
    return this.createSignedUrl('PUT', file, options);
  }

  createSignedDownloadUrl(
    file: FileRecord,
    options: SignedUrlOptions,
  ): SignedStorageUrl {
    return this.createSignedUrl('GET', file, options);
  }

  verifySignedUrl(
    method: 'GET' | 'PUT',
    file: FileRecord,
    expires: string,
    signature: string,
  ) {
    if (!expires || !signature) return false;
    const expiresAt = Number(expires) * 1000;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

    const expected = this.sign(method, file, expires);
    const expectedBuffer = Buffer.from(expected, 'hex');
    const providedBuffer = Buffer.from(signature, 'hex');
    return (
      expectedBuffer.length === providedBuffer.length &&
      timingSafeEqual(expectedBuffer, providedBuffer)
    );
  }

  writeObject(file: FileRecord, content: Buffer) {
    const objectPath = this.objectPath(file);
    mkdirSync(dirname(objectPath), { recursive: true });
    writeFileSync(objectPath, content);
  }

  readObject(file: FileRecord) {
    const objectPath = this.objectPath(file);
    if (!existsSync(objectPath)) return undefined;
    return readFileSync(objectPath);
  }

  save(file: FileRecord) {
    const files = this.readAll();
    files[file.id] = file;
    this.writeAll(files);
    return file;
  }

  get(id: string) {
    return this.readAll()[id];
  }

  list() {
    return Object.values(this.readAll());
  }

  archive(id: string) {
    const files = this.readAll();
    const file = files[id];
    if (!file) return undefined;

    const archived: FileRecord = {
      ...file,
      status: 'archived',
      archivedAt: new Date().toISOString(),
    };
    files[id] = archived;
    this.writeAll(files);
    return archived;
  }

  count() {
    return Object.keys(this.readAll()).length;
  }

  private readAll(): Record<string, FileRecord> {
    if (!existsSync(this.metadataPath)) return {};

    try {
      return JSON.parse(readFileSync(this.metadataPath, 'utf8')) as Record<
        string,
        FileRecord
      >;
    } catch {
      return {};
    }
  }

  private writeAll(files: Record<string, FileRecord>) {
    mkdirSync(dirname(this.metadataPath), { recursive: true });
    const temporaryPath = `${this.metadataPath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(files, null, 2), 'utf8');
    renameSync(temporaryPath, this.metadataPath);
  }

  private createSignedUrl(
    method: 'GET' | 'PUT',
    file: FileRecord,
    options: SignedUrlOptions,
  ): SignedStorageUrl {
    const expiresAt = new Date(
      Date.now() + options.expiresInSeconds * 1000,
    ).toISOString();
    const expires = Math.floor(new Date(expiresAt).getTime() / 1000).toString();
    const signature = this.sign(method, file, expires);
    const baseUrl = (
      options.baseUrl || `http://localhost:${process.env.PORT || 3000}`
    ).replace(/\/$/, '');
    const url = new URL(
      `${baseUrl}/files/${encodeURIComponent(file.id)}/content`,
    );
    url.searchParams.set('tenantId', file.tenantId);
    url.searchParams.set('expires', expires);
    url.searchParams.set('signature', signature);

    const headers =
      method === 'PUT' ? { 'content-type': file.contentType } : undefined;
    return {
      driver: this.driver,
      method,
      url: url.toString(),
      objectKey: file.objectKey,
      expiresAt,
      headers,
    };
  }

  private sign(method: 'GET' | 'PUT', file: FileRecord, expires: string) {
    return createHmac('sha256', this.signingSecret)
      .update(
        [method, file.tenantId, file.id, file.objectKey, expires].join('\n'),
      )
      .digest('hex');
  }

  private resolveSigningSecret() {
    const secret = process.env.LOCAL_STORAGE_SIGNING_SECRET?.trim();
    if (!secret) {
      throw new Error('LOCAL_STORAGE_SIGNING_SECRET is required');
    }
    if (secret.length < MINIMUM_SIGNING_SECRET_LENGTH) {
      throw new Error(
        `LOCAL_STORAGE_SIGNING_SECRET must be at least ${MINIMUM_SIGNING_SECRET_LENGTH} characters`,
      );
    }
    if (placeholderSecrets.has(secret.toLowerCase())) {
      throw new Error(
        'LOCAL_STORAGE_SIGNING_SECRET must not use a known placeholder value',
      );
    }
    return secret;
  }

  private safeFileName(fileName: string) {
    return encodeURIComponent(
      fileName.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'file',
    );
  }

  private objectPath(file: FileRecord) {
    const objectPath = resolve(this.objectRootPath, file.objectKey);
    if (!objectPath.startsWith(`${this.objectRootPath}/`)) {
      throw new Error('Invalid object key');
    }
    return objectPath;
  }
}
