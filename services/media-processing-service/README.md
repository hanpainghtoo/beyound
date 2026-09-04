# Media Processing Service

`media-processing-service` is the planned boundary for asynchronous media work such as image optimization, attachment scanning, audio transcription, and derived media generation.

## Current Status

This service is included in the PM2 runtime topology. It exposes health/readiness endpoints, `POST /media/jobs`, `GET /media/jobs`, `GET /media/jobs/:id`, `POST /media/jobs/:id/process`, and `POST /media/jobs/drain` as the Phase 1 media job contract.

Job state is persisted through the local JSON queue/store by default. The worker transitions jobs through `queued`, `processing`, `completed`, and `failed`, records retry metadata, generates WebP thumbnail/optimized image derivatives through `sharp`, supports configurable production HTTP providers for binary scanning and multipart audio/video transcription, and sends status callbacks when a core callback endpoint is configured. Placeholder scan/transcription outputs remain the safe local default until a provider is explicitly enabled.

## Intended Responsibilities

- Process uploaded media outside request/response paths.
- Optimize images and derive thumbnails/previews.
- Run future audio/video transcription or analysis workflows.
- Report processing state back to the core API.
- Keep CPU-heavy media work out of the core API process.

## Local Setup

```bash
npm install
npm run start:dev
```

The service listens on `PORT`, defaulting to `3000`. In the PM2 development stack it is exposed at:

```text
http://localhost:6006
```

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port inside the service. |
| `CORE_API_URL` | Core API base URL, for example `http://localhost:6001/api/v1`. |
| `FILE_STORAGE_URL` | File storage service URL. |
| `MEDIA_QUEUE_BACKEND` | Queue backend label, currently `local-json`. |
| `MEDIA_JOB_STORE_PATH` | Durable media job JSON path. |
| `MEDIA_WORKER_ENABLED` | Set to `true` to run the in-service worker loop. |
| `MEDIA_WORKER_INTERVAL_MS` | Worker poll interval, default `1000`. |
| `MEDIA_JOB_MAX_ATTEMPTS` | Max processing attempts before `failed`, default `3`. |
| `MEDIA_JOB_RETRY_BASE_DELAY_MS` | Linear retry delay base, default `250`. |
| `MEDIA_IMAGE_PROCESSING_MODE` | Use `sharp` for real image derivatives or `placeholder` for contract-only tests. |
| `MEDIA_STATUS_CALLBACK_URL` | Callback endpoint for media job status changes, for example `${CORE_API_URL}/internal/media-jobs/status`. Defaults to that internal core route when `CORE_API_URL` is set. |
| `FILE_SCANNING_PROVIDER` | Set to `http` to enable the production scanning adapter; absent means placeholder scan result. |
| `FILE_SCANNING_ENDPOINT` | Endpoint accepting raw file bytes and returning `{ verdict: "clean" | "infected", threats?, engineVersion? }`. |
| `FILE_SCANNING_API_KEY` | Optional bearer credential for the scanning endpoint. |
| `TRANSCRIPTION_PROVIDER` | Set to `http` to enable the production transcription adapter; absent means placeholder transcription result. |
| `TRANSCRIPTION_ENDPOINT` | Endpoint accepting multipart `file`, `model`, and optional `language`, returning `text` or `transcript`. |
| `TRANSCRIPTION_API_KEY` | Optional bearer credential for the transcription endpoint. |
| `TRANSCRIPTION_MODEL` | Provider model name, default `default`. |

Provider enablement is fail-closed: selecting an unsupported provider, omitting
its endpoint, returning an invalid scan verdict, returning an empty transcript,
or attempting to transcribe a non-audio/video file activates the durable retry
policy and eventually marks the job failed.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run start:dev` | Start NestJS in watch mode. |
| `npm run build` | Build the service. |
| `npm run start:prod` | Run the compiled service. |
| `npm run lint` | Run ESLint with auto-fix. |
| `npm run test` | Run Jest tests. |
| `npm run test:e2e` | Run e2e tests. |

## PM2

From the repository root:

```bash
npm run pm2:dev:start
```
