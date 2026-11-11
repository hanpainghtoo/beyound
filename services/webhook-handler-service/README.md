# Webhook Handler Service

`webhook-handler-service` is the planned boundary for inbound third-party webhooks that are not direct chat ingestion events.

## Current Status

This service is included in the PM2 runtime topology. It exposes health/readiness endpoints plus provider webhook routes at `GET /webhooks/:provider/:channelId` and `POST /webhooks/:provider/:channelId`.

Telegram provider API operations such as `setWebhook`, `getWebhookInfo`, and
`deleteWebhook` are intentionally centralized in the integration service. This
service only receives and verifies public Telegram callbacks.

Viber webhook registration is available through:

- `POST /webhooks/viber/:channelId/register`
- `DELETE /webhooks/viber/:channelId/register`

## Intended Responsibilities

- Receive inbound webhooks from integrated external systems.
- Verify provider signatures and reject invalid requests.
- Normalize webhook payloads into platform events.
- Enforce idempotency for provider retries.
- Forward accepted events to the core API or future event bus.

## Local Setup

```bash
npm install
npm run start:dev
```

The service listens on `PORT`, defaulting to `3000`. In the PM2 development stack it is exposed at:

```text
http://localhost:6003
```

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port inside the service. |
| `CORE_API_URL` | Core API base URL, for example `http://localhost:6001/api/v1`. |
| `CHAT_INGESTION_URL` | Chat ingestion service URL. |
| `MESSENGER_VERIFY_TOKEN` | Messenger webhook verification token. |
| `MESSENGER_APP_SECRET` | Messenger app secret used to verify the raw `X-Hub-Signature-256` request signature. |
| `TIKTOK_CLIENT_SECRET` | TikTok client secret used to verify signed TikTok webhook requests when configured. |
| `VIBER_AUTH_TOKEN` | Viber auth token used to verify raw `X-Viber-Content-Signature` HMAC-SHA256 signatures at the webhook edge. |
| `VIBER_API_BASE_URL` | Optional Viber Business Messages API base URL override. |
| `WEBHOOK_QUEUE_BACKEND` | Queue backend. Use `redis` for PM2 development and production-like runtime or omit for in-memory local tests. |
| `WEBHOOK_QUEUE_MAX_DEPTH` | Maximum pending webhook events before backpressure rejects new events. Defaults to `1000`. |
| `WEBHOOK_QUEUE_MAX_ATTEMPTS` | Maximum forwarding attempts before dead-lettering an event. Defaults to `3`. |
| `WEBHOOK_QUEUE_RETRY_BASE_DELAY_MS` | Base retry delay multiplier for failed forwarding attempts. Defaults to `250`. |
| `WEBHOOK_IDEMPOTENCY_TTL_MS` | Idempotency claim TTL for duplicate provider webhook deliveries. Defaults to 24 hours. |
| `WEBHOOK_REDIS_KEY_PREFIX` | Redis key prefix for webhook queue/idempotency state. Defaults to `commerce-os:webhooks`. |
| `REDIS_URL` | Optional full Redis URL for the Redis-backed webhook queue. |
| `REDIS_HOST` / `REDIS_PORT` | Redis host/port used when `REDIS_URL` is not set. |
| `TELEGRAM_API_BASE_URL` | Optional Telegram Bot API base URL override for testing or a compatible gateway. |

Registration requires `botToken` and an HTTPS `webhookUrl`. It supports
Telegram `secret_token`, `allowed_updates`, and `drop_pending_updates`.
Provider errors include `retry_after` hints without returning the bot token.

Messenger webhook requests are deduplicated with stable IDs for messages,
delivery receipts, read receipts, and provider errors. When
`MESSENGER_APP_SECRET` is configured, missing or invalid signatures are rejected
before the event is queued.

TikTok webhook requests are deduplicated with stable IDs for nested lead and
comment capture payloads. When `TIKTOK_CLIENT_SECRET` is configured, missing,
malformed, mismatched, or stale `TikTok-Signature` headers are rejected before
the event is queued.

Viber callbacks are deduplicated from event type, message token, and user ID.
When `VIBER_AUTH_TOKEN` is configured, missing or invalid
`X-Viber-Content-Signature` callbacks are rejected before queueing. Registration
requires an auth token and an HTTPS callback URL.

When `WEBHOOK_QUEUE_BACKEND=redis`, provider event idempotency claims, pending
events, in-flight processing IDs, completed event IDs, and dead letters are
stored in Redis under `WEBHOOK_REDIS_KEY_PREFIX`. The service claims pending
work with an atomic pending-to-processing move and removes the processing entry
only after successful forwarding or dead-lettering. On drain startup, stale
processing entries older than `WEBHOOK_QUEUE_PROCESSING_TIMEOUT_MS` are requeued
so a worker/process crash does not lose accepted events. Production readiness
requires the Redis backend; without `WEBHOOK_QUEUE_BACKEND=redis`, the service
uses the in-memory queue only for local unit tests and lightweight development.

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
