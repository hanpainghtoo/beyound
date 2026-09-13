# Stuck Media Jobs Runbook

Use this runbook when media jobs remain queued or processing longer than expected.

## First Checks

1. Confirm `media-processing-service` is healthy:

```bash
curl http://localhost:3006/ready
```

2. Confirm `file-storage-service` is healthy:

```bash
curl http://localhost:3005/ready
```

3. Inspect the job by ID:

```bash
curl http://localhost:3006/media/jobs/<job-id>
```

4. List queued or failed jobs:

```bash
curl "http://localhost:3006/media/jobs?status=queued"
curl "http://localhost:3006/media/jobs?status=failed"
```

## Current Job States

| State | Meaning |
| --- | --- |
| `queued` | Job is persisted and waiting for the worker or a retry window. |
| `processing` | Worker has started the current attempt. |
| `completed` | Job finished and output metadata is recorded. |
| `failed` | Job exhausted retry attempts. |
| `not_found` | Job ID is unknown to the durable job store. |

## Common Causes

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Jobs disappear after restart | `MEDIA_JOB_STORE_PATH` points at ephemeral storage | Mount the media job data volume and restart the service. |
| Jobs stay queued | `MEDIA_WORKER_ENABLED` is false or retry window is in the future | Enable the worker or run `POST /media/jobs/drain`. |
| File lookup fails | File storage metadata is unavailable | Check file-storage service health and file ID. |
| Core callbacks fail | Callback endpoint is missing or rejects the internal service token | Check `MEDIA_STATUS_CALLBACK_URL`, `CORE_API_URL`, and `INTERNAL_SERVICE_TOKEN_SIGNING_KEY`. |

## Recovery Steps

1. Confirm whether the uploaded file exists in file storage.
2. Drain runnable queued jobs:

```bash
curl -X POST http://localhost:3006/media/jobs/drain
```

3. Process a specific queued job:

```bash
curl -X POST http://localhost:3006/media/jobs/<job-id>/process
```

4. Recreate the media job if the current job is missing from the durable store.
5. Avoid deleting the original file until the job is completed or intentionally abandoned.
6. Record tenant ID, file ID, job ID, job type, attempts, callback status, and timestamps.

## Launch Note

The current media service persists job state and generates thumbnail/optimized image derivatives. Public launch still needs production scanning/transcription providers before media processing should be considered feature-complete.
