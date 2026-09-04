# Telegram Channel Setup

Use this runbook to connect a tenant Telegram bot to Commerce OS.

## Required Access

- A Telegram account that can create or manage the bot.
- The bot token issued by BotFather.
- Access to the ZayOS Business Workspace.

## Commerce OS Fields

| Field | Required | Notes |
| --- | --- | --- |
| Bot token | Yes | Secret token from BotFather. Commerce OS stores this encrypted. |
| Bot username | No | Useful for tenant operators to identify the connected bot. |
| Webhook URL | Yes for inbound messages | Must be a public HTTPS Commerce OS webhook endpoint. |
| Webhook secret token | Recommended | 1-256 letters, numbers, underscores, or hyphens. |

## Setup Steps

1. In Telegram, open BotFather and create or select the tenant bot.
2. Copy the bot token from BotFather.
3. In Commerce OS tenant dashboard, open `Channels`.
4. Add a `Telegram` channel.
5. Enter a display name, bot token, and optional bot username.
6. Save the channel.
7. Click `Test Connection`.
8. Register the public HTTPS callback through the trusted internal webhook
   service route `POST /webhooks/telegram/:channelId/register`.
9. Include the bot token, webhook URL, a per-channel secret token, and the
   required allowed updates (`message`, `edited_message`, `callback_query`).

## Verification

- Credential status should show `configured` or `encrypted`.
- Provider status should show `connected` after a successful test.
- Send a test message to the bot and confirm it appears in the csr inbox.
- Send an csr reply and confirm Telegram returns a provider message ID.
- Confirm Bot API failures mark the Commerce OS message as `failed` and retain
  safe retry metadata without exposing the bot token.

## Troubleshooting

- `Missing required provider credential: botToken`: re-enter the bot token.
- `pending_configuration`: credential fields are incomplete or validation has not passed.
- `error`: confirm the bot token belongs to the intended bot and has not been revoked.
