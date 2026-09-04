# File Storage Service

`file-storage-service` is the planned boundary for storing and serving tenant files, attachments, product images, logos, and other binary assets.

## Current Status

This service is included in the PM2 runtime topology. It exposes health/readiness endpoints, `GET /files`, `POST /files/metadata`, `POST /files/uploads`, `GET /files/:id`, and `GET /files/:id/download-url` as the file metadata and signed URL contract. Internal metadata endpoints require a scoped internal service JWT and `x-tenant-id`; tenant ownership is never accepted from the request body. The Core API is the browser-facing authorization boundary.

`local-disk` storage issues signed service URLs for local development and stores object bytes under `FILE_OBJECT_STORAGE_PATH`. `s3-compatible` storage issues SigV4 presigned PUT/GET URLs for S3-compatible object storage. Capacity-checked upload registration uses a tenant-scoped Redis reservation so multiple file-storage processes cannot pass the same check concurrently; production readiness performs a bounded Redis ping and is false when the reservation backend is absent or unreachable.

## Intended Responsibilities

- Accept uploads for tenant-scoped files and message attachments.
- Store file metadata and delegate binary storage to local disk or object storage.
- Enforce tenant-aware file access.
- Generate download URLs or signed object-storage URLs.
- Provide a stable file API for dashboards and backend workflows.

## Local Setup

```bash
npm install
npm run start:dev
```

The service listens on `PORT`, defaulting to `3000`. In the PM2 development stack it is exposed at:

```text
http://localhost:6005
```

## Environment

| Variable                             | Purpose                                                                |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `PORT`                               | HTTP port inside the service.                                          |
| `CORE_API_URL`                       | Core API base URL, for example `http://localhost:6001/api/v1`.         |
| `STORAGE_DRIVER`                     | `local-disk`, `s3`, or `s3-compatible`.                                |
| `INTERNAL_SERVICE_TOKEN_SIGNING_KEY` | Required private signing key for short-lived internal service JWTs.    |
| `INTERNAL_SERVICE_TOKEN_ISSUER`      | Internal service JWT issuer.                                           |
| `FILE_METADATA_PATH`                 | Local metadata JSON path used by local and S3-compatible drivers.      |
| `FILE_OBJECT_STORAGE_PATH`           | Local object byte storage path used by `local-disk`.                   |
| `FILE_STORAGE_PUBLIC_URL`            | Public URL used when generating local signed URLs.                     |
| `REDIS_URL`                          | Shared Redis URL used for cross-process storage-capacity reservations. |
| `REDIS_HOST` / `REDIS_PORT`          | Shared Redis host/port fallback when `REDIS_URL` is absent.            |
| `STORAGE_CAPACITY_LOCK_TTL_MS`       | Reservation lock TTL, default `30000` milliseconds.                    |
| `SIGNED_URL_TTL_SECONDS`             | Signed upload/download URL lifetime, default `900`.                    |
| `MAX_FILE_SIZE`                      | Maximum accepted file size in bytes, default `10485760`.               |
| `ALLOWED_FILE_CONTENT_TYPES`         | Comma-separated allow-list for upload metadata validation.             |
| `S3_ENDPOINT`                        | S3-compatible endpoint used when `STORAGE_DRIVER=s3-compatible`.       |
| `S3_PUBLIC_ENDPOINT`                 | Optional public S3 endpoint to embed in presigned URLs.                |
| `S3_REGION`                          | S3 signing region, default `us-east-1`.                                |
| `S3_BUCKET`                          | Object-storage bucket name.                                            |
| `S3_ACCESS_KEY_ID`                   | Object-storage access key ID for URL signing.                          |
| `S3_SECRET_ACCESS_KEY`               | Object-storage secret access key for URL signing.                      |
| `S3_FORCE_PATH_STYLE`                | Use path-style URLs unless set to `false`.                             |
| `S3_OBJECT_KEY_PREFIX`               | Object key prefix, default `commerce-os-files`.                        |

## Scripts

| Command              | Purpose                     |
| -------------------- | --------------------------- |
| `npm run start:dev`  | Start NestJS in watch mode. |
| `npm run build`      | Build the service.          |
| `npm run start:prod` | Run the compiled service.   |
| `npm run lint`       | Run ESLint with auto-fix.   |
| `npm run test`       | Run Jest tests.             |
| `npm run test:e2e`   | Run e2e tests.              |

## PM2

From the repository root:

```bash
npm run pm2:dev:start
```
