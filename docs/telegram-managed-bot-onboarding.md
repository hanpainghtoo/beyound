# Telegram Managed Merchant-Bot Onboarding

ZayOS uses `@ZayOSManagerBot` only for onboarding and management. It is never a customer-facing commerce channel. Each workspace connects its own merchant-owned Telegram bot, for example `@GoldenMobileMMBot`.

## Create The Management Bot

1. Open BotFather and create:
   - Bot name: `ZayOS Channel Manager`
   - Username: `ZayOSManagerBot`
2. Open BotFather's Mini App settings for the bot.
3. Enable management of other bots, also called Bot Management Mode.
4. Store the manager token only in server-side production secrets.

If readiness reports this error, Bot Management Mode is not enabled:

`Telegram bot management is not enabled for @ZayOSManagerBot. Enable management of other bots in the BotFather Mini App.`

## Production Environment

Required server-side variables:

```bash
TELEGRAM_MANAGER_BOT_TOKEN=
TELEGRAM_MANAGER_BOT_USERNAME=ZayOSManagerBot
TELEGRAM_MANAGER_WEBHOOK_SECRET=
TELEGRAM_MANAGER_WEBHOOK_URL=https://hooks.example.com/webhooks/telegram/manager
TELEGRAM_MERCHANT_WEBHOOK_BASE_URL=https://hooks.example.com
TELEGRAM_TOKEN_ENCRYPTION_KEY=
```

Do not use `NEXT_PUBLIC_` for any Telegram token or webhook secret.

## Register The Manager Webhook

Register `@ZayOSManagerBot` with Telegram:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_MANAGER_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "'"$TELEGRAM_MANAGER_WEBHOOK_URL"'",
    "secret_token": "'"$TELEGRAM_MANAGER_WEBHOOK_SECRET"'",
    "allowed_updates": ["message", "managed_bot"],
    "drop_pending_updates": false
  }'
```

Verify:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_MANAGER_BOT_TOKEN/getMe"
curl -X POST "https://api.telegram.org/bot$TELEGRAM_MANAGER_BOT_TOKEN/getWebhookInfo"
```

`getMe.result.can_manage_bots` must be `true`.

## Merchant Bot Creation Test

1. Sign in to ZayOS as a workspace Owner or Administrator.
2. Go to Settings -> Channels -> Telegram.
3. Choose `Create My Business Bot`.
4. Enter the merchant bot display name and suggested username.
5. Continue in Telegram.
6. Start `@ZayOSManagerBot`.
7. Confirm Telegram's managed bot creation prompt.
8. Return to ZayOS and wait for the request to show `Connected`.

The connected channel must show the merchant bot username, not `@ZayOSManagerBot`.

## Recovery

If merchant webhook registration fails, the onboarding request is marked `failed` and the channel remains recoverable with webhook registration status `failed`. Fix the URL, TLS, DNS, or token issue, then retry setup for the same bot or add a controlled retry operation.

Duplicate `managed_bot` and `managed_bot_created` updates are deduplicated by Telegram `update_id` in the webhook handler and by bot ID uniqueness in core persistence.

## Token Rotation

Rotate the manager token in BotFather, update `TELEGRAM_MANAGER_BOT_TOKEN`, restart core and webhook-handler services, then re-register the manager webhook with the new token and the same secret.

Do not rotate merchant bot tokens during normal onboarding. Use Telegram's managed token rotation only for explicit recovery or security operations.

## Disconnect

Disconnecting a managed Telegram channel deletes the Telegram webhook and disables the ZayOS channel connection. It does not delete or transfer ownership of the merchant's Telegram bot.
