# Integration Service

`integration-service` is the planned boundary for outbound integrations with external platforms and provider APIs.

## Current Status

This service is included in the PM2 runtime topology. It exposes health/readiness endpoints, `GET /providers`, and outbound sends at `POST /providers/:provider/send`.

Telegram sends call the Bot API directly, Facebook Messenger sends call the
Graph API directly, and Viber sends call the Business Messages API directly
for text, image, and file messages.
TikTok is fail-closed for outbound sends because the confirmed public product
surface does not expose general inbox/direct-message sending; Commerce OS keeps
TikTok credential validation and inbound lead/comment event contracts ready for
approved Business/API access.

## Intended Responsibilities

- Call external provider APIs on behalf of tenants.
- Centralize provider-specific clients and request signing.
- Apply rate limits and retry policies for outbound calls.
- Report delivery status and provider errors back to the core API.
- Keep provider integration concerns outside core domain services.

## Local Setup

```bash
npm install
npm run start:dev
```

The service listens on `PORT`, defaulting to `3000`. In the PM2 development stack it is exposed at:

```text
http://localhost:6004
```

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port inside the service. |
| `CORE_API_URL` | Core API base URL, for example `http://localhost:6001/api/v1`. |
| `TELEGRAM_API_BASE_URL` | Optional Telegram Bot API base URL override for testing or a compatible gateway. |
| `MESSENGER_GRAPH_API_BASE_URL` | Optional Messenger Graph API base URL override for testing or a compatible gateway. |
| `MESSENGER_GRAPH_API_VERSION` | Optional pinned Graph API version, for example `v25.0`. When omitted, Meta's unversioned endpoint behavior applies. |
| `VIBER_API_BASE_URL` | Optional Viber Business Messages API base URL override. Defaults to `https://chatapi.viber.com/pa`. |

## Telegram Send Contract

`POST /providers/telegram/send` accepts:

- `channelId`
- `recipientId` containing the Telegram chat ID
- `content`
- `messageType`: `text`, `image`, or `file`
- `attachments[0].url` for image/file sends
- `credentials.botToken`

Successful sends return the Telegram message ID and `status: sent`. Provider
errors include safe retry hints, including Telegram `retry_after`, without
returning the bot token. When `metadata.internalMessageId` is provided, the
service reports provider acceptance or failure to
`/api/v1/internal/provider-events/message-status` so the core message record is
updated to `sent` or `failed`.

## Facebook Messenger Send Contract

`POST /providers/messenger/send` accepts:

- `channelId`
- `recipientId` containing the Page-scoped user ID
- `content`
- `messageType`: `text`, `image`, or `file`
- `attachments[0].url` for image/file sends
- `credentials.pageId`
- `credentials.pageAccessToken`

Successful sends return Meta's message ID and `status: sent`. Graph API errors
are normalized into safe provider error and retry metadata without returning
the Page access token. When `metadata.internalMessageId` is provided, the same
core message-status callback used by Telegram persists Messenger acceptance or
failure.

## Viber Send Contract

`POST /providers/viber/send` accepts `recipientId`, content, `text`, `image`, or
`file`, an attachment URL for media, and `credentials.authToken`. Optional
`botName` and `botAvatar` credentials control sender presentation. Provider
status codes and message tokens are normalized without exposing the auth token;
delivery, seen, and failed callbacks are expected through the webhook service.

## TikTok Product Surface Decision

As of the 2026-06-26 launch audit, Commerce OS treats TikTok as an inbound
lead/comment capture channel until the tenant has written approval for a
specific TikTok Business/API messaging surface. `GET /providers/tiktok` reports
`status: requires-provider-access`, no outbound message types, and expected
event families of `lead` and `comment`.

`POST /providers/tiktok/send` returns `accepted: false` with
`status: unsupported_message_type`; it does not fabricate queued sends.

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
