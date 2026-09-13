import { getFileStorageCorsOptions } from './cors.config';

describe('file-storage CORS configuration', () => {
  it('keeps local development permissive when no origins are configured', () => {
    expect(getFileStorageCorsOptions({ NODE_ENV: 'development' }).origin).toBe(
      true,
    );
  });

  it('disables cross-origin access in production without an allowlist', () => {
    expect(getFileStorageCorsOptions({ NODE_ENV: 'production' }).origin).toBe(
      false,
    );
    expect(
      getFileStorageCorsOptions({
        NODE_ENV: 'production',
        FILE_STORAGE_ALLOWED_ORIGINS: '*',
      }).origin,
    ).toBe(false);
  });

  it('uses the scoped allowlist and explicit signed-url headers', () => {
    expect(
      getFileStorageCorsOptions({
        NODE_ENV: 'production',
        FILE_STORAGE_ALLOWED_ORIGINS:
          'https://admin.zayos.com.mm, https://zayos.com.mm',
        FRONTEND_URLS: 'https://not-used.example',
      }),
    ).toEqual({
      origin: ['https://admin.zayos.com.mm', 'https://zayos.com.mm'],
      methods: ['GET', 'PUT', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
      credentials: false,
      optionsSuccessStatus: 204,
    });
  });
});
