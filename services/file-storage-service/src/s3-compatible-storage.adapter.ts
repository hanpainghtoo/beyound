import { createHash, createHmac } from 'crypto';
import type {
  FileRecord,
  FileStorageAdapter,
  ObjectKeyInput,
  SignedStorageUrl,
  SignedUrlOptions,
} from './file-storage.adapter';
import { LocalDiskStorageAdapter } from './local-disk-storage.adapter';

export class S3CompatibleStorageAdapter implements FileStorageAdapter {
  readonly driver = 's3-compatible';

  private readonly metadataStore: LocalDiskStorageAdapter;
  private readonly endpoint: URL;
  private readonly region: string;
  private readonly bucket: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly forcePathStyle: boolean;
  private readonly keyPrefix: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.metadataStore = new LocalDiskStorageAdapter(env.FILE_METADATA_PATH);
    this.endpoint = new URL(
      env.S3_PUBLIC_ENDPOINT || this.required(env, 'S3_ENDPOINT'),
    );
    this.region = env.S3_REGION || 'us-east-1';
    this.bucket = this.required(env, 'S3_BUCKET');
    this.accessKeyId = this.required(env, 'S3_ACCESS_KEY_ID');
    this.secretAccessKey = this.required(env, 'S3_SECRET_ACCESS_KEY');
    this.forcePathStyle = env.S3_FORCE_PATH_STYLE !== 'false';
    this.keyPrefix = this.normalizePrefix(
      env.S3_OBJECT_KEY_PREFIX || 'commerce-os-files',
    );
  }

  buildObjectKey(input: ObjectKeyInput) {
    return [
      this.keyPrefix,
      'tenants',
      input.tenantId,
      input.id,
      this.safeFileName(input.fileName),
    ]
      .filter(Boolean)
      .join('/');
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

  save(file: FileRecord) {
    return this.metadataStore.save(file);
  }

  get(id: string) {
    return this.metadataStore.get(id);
  }

  list() {
    return this.metadataStore.list();
  }

  archive(id: string) {
    return this.metadataStore.archive(id);
  }

  count() {
    return this.metadataStore.count();
  }

  private createSignedUrl(
    method: 'GET' | 'PUT',
    file: FileRecord,
    options: SignedUrlOptions,
  ): SignedStorageUrl {
    const now = new Date();
    const amzDate = this.toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const expiresInSeconds = Math.max(
      1,
      Math.min(options.expiresInSeconds, 604800),
    );
    const expiresAt = new Date(
      now.getTime() + expiresInSeconds * 1000,
    ).toISOString();
    const objectLocation = this.objectLocation(file.objectKey);
    const signedHeaders =
      method === 'PUT' ? ['content-type', 'host'] : ['host'];
    const headerValues: Record<string, string> = {
      host: objectLocation.host,
    };
    if (method === 'PUT') headerValues['content-type'] = file.contentType;

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const query: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.accessKeyId}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresInSeconds),
      'X-Amz-SignedHeaders': signedHeaders.join(';'),
    };

    const canonicalRequest = [
      method,
      objectLocation.canonicalUri,
      this.canonicalQuery(query),
      this.canonicalHeaders(headerValues),
      signedHeaders.join(';'),
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256(canonicalRequest),
    ].join('\n');
    query['X-Amz-Signature'] = this.hmacHex(
      this.signingKey(dateStamp),
      stringToSign,
    );

    const url = new URL(objectLocation.url);
    for (const [name, value] of Object.entries(query)) {
      url.searchParams.set(name, value);
    }

    return {
      driver: this.driver,
      method,
      url: url.toString(),
      objectKey: file.objectKey,
      expiresAt,
      headers:
        method === 'PUT' ? { 'content-type': file.contentType } : undefined,
    };
  }

  private objectLocation(objectKey: string) {
    const encodedKey = objectKey
      .split('/')
      .map((part) => this.awsEncode(part))
      .join('/');
    const endpointPath = this.endpoint.pathname.replace(/\/+$/, '');

    if (this.forcePathStyle) {
      const canonicalUri =
        `${endpointPath}/${this.awsEncode(this.bucket)}/${encodedKey}`.replace(
          /\/{2,}/g,
          '/',
        );
      return {
        canonicalUri,
        host: this.endpoint.host,
        url: `${this.endpoint.protocol}//${this.endpoint.host}${canonicalUri}`,
      };
    }

    const host = `${this.bucket}.${this.endpoint.host}`;
    const canonicalUri = `${endpointPath}/${encodedKey}`.replace(
      /\/{2,}/g,
      '/',
    );
    return {
      canonicalUri,
      host,
      url: `${this.endpoint.protocol}//${host}${canonicalUri}`,
    };
  }

  private canonicalHeaders(headers: Record<string, string>) {
    return Object.entries(headers)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${name.toLowerCase()}:${value.trim()}\n`)
      .join('');
  }

  private canonicalQuery(query: Record<string, string>) {
    return Object.entries(query)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([name, value]) => `${this.awsEncode(name)}=${this.awsEncode(value)}`,
      )
      .join('&');
  }

  private signingKey(dateStamp: string) {
    const dateKey = this.hmac(`AWS4${this.secretAccessKey}`, dateStamp);
    const regionKey = this.hmac(dateKey, this.region);
    const serviceKey = this.hmac(regionKey, 's3');
    return this.hmac(serviceKey, 'aws4_request');
  }

  private hmac(key: string | Buffer, value: string) {
    return createHmac('sha256', key).update(value).digest();
  }

  private hmacHex(key: string | Buffer, value: string) {
    return createHmac('sha256', key).update(value).digest('hex');
  }

  private sha256(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private toAmzDate(value: Date) {
    return value.toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  private awsEncode(value: string) {
    return encodeURIComponent(value).replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  }

  private normalizePrefix(value: string) {
    return value.replace(/^\/+|\/+$/g, '');
  }

  private safeFileName(fileName: string) {
    return fileName.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  }

  private required(env: NodeJS.ProcessEnv, name: string) {
    const value = env[name];
    if (!value)
      throw new Error(`${name} is required for s3-compatible storage`);
    return value;
  }
}
