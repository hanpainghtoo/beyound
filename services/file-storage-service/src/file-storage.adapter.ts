export type FileRecord = {
  id: string;
  tenantId: string;
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
  storageDriver: string;
  objectKey: string;
  status: 'registered' | 'archived';
  createdAt: string;
  uploadedAt?: string;
  archivedAt?: string;
};

export type ObjectKeyInput = Pick<FileRecord, 'id' | 'tenantId' | 'fileName'>;

export type SignedUrlOptions = {
  baseUrl?: string;
  expiresInSeconds: number;
};

export type SignedStorageUrl = {
  driver: string;
  method: 'GET' | 'PUT';
  url: string;
  objectKey: string;
  expiresAt: string;
  headers?: Record<string, string>;
};

export interface FileStorageAdapter {
  readonly driver: string;
  buildObjectKey(input: ObjectKeyInput): string;
  createSignedUploadUrl(
    file: FileRecord,
    options: SignedUrlOptions,
  ): SignedStorageUrl;
  createSignedDownloadUrl(
    file: FileRecord,
    options: SignedUrlOptions,
  ): SignedStorageUrl;
  verifySignedUrl?(
    method: 'GET' | 'PUT',
    file: FileRecord,
    expires: string,
    signature: string,
  ): boolean;
  writeObject?(file: FileRecord, content: Buffer): void;
  readObject?(file: FileRecord): Buffer | undefined;
  save(file: FileRecord): FileRecord;
  get(id: string): FileRecord | undefined;
  list(): FileRecord[];
  archive(id: string): FileRecord | undefined;
  count(): number;
}
