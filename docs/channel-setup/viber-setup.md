# Viber Channel Setup

## Prerequisites

- Approved Viber Business Messages/bot account and current commercial access.
- Tenant-owned auth token stored only through encrypted channel credentials.
- Public HTTPS callback URL: `/webhooks/viber/{channelId}`.

## Credentials

Required: `authToken`. Optional: `botName`, `botAvatar`.

## Register The Webhook

Call `POST /webhooks/viber/{channelId}/register` on the webhook-handler service:

```json
{
  "authToken": "<tenant-owned-token>",
  "webhookUrl": "https://api.zayos.com.mm/webhooks/viber/<channel-id>",
  "eventTypes": ["delivered", "seen", "failed", "subscribed", "unsubscribed", "conversation_started"]
}
```

Set `VIBER_AUTH_TOKEN` at the webhook edge to verify raw
`X-Viber-Content-Signature` HMAC-SHA256 callbacks. A multi-tenant production
edge should resolve the encrypted channel token per channel instead of relying
on one global fallback.

## Supported Behavior

- Outbound text, picture, and file messages.
- Inbound text and media normalization.
- Delivered, seen/read, and failed status callbacks.
- Stable webhook idempotency keys and the shared retry/dead-letter queue.

## Production Smoke

1. Register the HTTPS callback and confirm Viber returns status `0`.
2. Send an inbound message and confirm one ZayOS conversation/message is created.
3. Send text, picture, and file replies and record returned message tokens.
4. Confirm delivered and seen callbacks update the core message status.
5. Exercise a provider rejection and confirm safe error/retry metadata.
6. Replay the same callback and confirm it is treated as a duplicate.
7. Remove the webhook with `DELETE /webhooks/viber/{channelId}/register` if rollback is required.
