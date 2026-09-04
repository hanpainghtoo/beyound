# Chat Ingestion Service

`chat-ingestion-service` is the planned boundary for inbound chat events from external channels before they are normalized and handed to the core API.

## Current Status

This service is included in the PM2 runtime topology. It exposes
health/readiness endpoints and the provider ingestion contract at `POST
/ingest`.

Inbound customer messages are normalized and forwarded to the core conversation
endpoint. Messenger delivery, read, echo, and targeted error callbacks are
instead forwarded to the core message-status endpoint so they cannot create
blank inbound messages.

TikTok lead and comment capture payloads are normalized into inbound messages
with stable external IDs, `lead` or `comment` message types, captured lead
fields or commenter/video metadata, and raw provider metadata for audit/debug
work. TikTok outbound messaging remains blocked in the integration service
until a tenant-specific approved messaging API surface exists.

## Intended Responsibilities

- Receive inbound chat messages from supported channels.
- Normalize provider-specific payloads into platform message events.
- Validate channel and tenant ownership before forwarding.
- Forward accepted events to the core API or future event bus.
- Isolate provider webhook noise from core conversation logic.

## Local Setup

```bash
npm install
npm run start:dev
```

The service listens on `PORT`, defaulting to `3000`. In the PM2 development stack it is exposed at:

```text
http://localhost:6002
```

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port inside the service. |
| `CORE_API_URL` | Core API base URL, for example `http://localhost:6001/api/v1`. |
| `INTERNAL_SERVICE_TOKEN_SIGNING_KEY` | Required private signing key for short-lived internal service JWTs. |
| `INTERNAL_SERVICE_TOKEN_ISSUER` | Internal service JWT issuer. |

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
