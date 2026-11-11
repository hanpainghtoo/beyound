# Production Provider Credential Smoke

Use this runbook after tenant-owned production or sandbox credentials are
available. The script drives Commerce OS service endpoints, not direct ad hoc
provider code.

## Command

```bash
PROVIDER_SMOKE_REQUIRE_ALL=true npm run smoke:providers
```

By default, the script targets:

- `INTEGRATION_SERVICE_URL=http://localhost:3004`
- `WEBHOOK_HANDLER_URL=http://localhost:3003`
- providers: `telegram,messenger,tiktok`

Override with:

```bash
PROVIDER_SMOKE_PROVIDERS=telegram,messenger npm run smoke:providers
```

## Required Variables

### Telegram

Required for outbound send:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Optional webhook registration:

- `TELEGRAM_CHANNEL_ID`
- `TELEGRAM_WEBHOOK_URL`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_DROP_PENDING_UPDATES=true`

### Facebook Messenger

Required for outbound send:

- `MESSENGER_PAGE_ID`
- `MESSENGER_PAGE_ACCESS_TOKEN`
- `MESSENGER_RECIPIENT_ID`

Required for webhook challenge smoke:

- `MESSENGER_VERIFY_TOKEN`
- `MESSENGER_CHANNEL_ID` or `MESSENGER_PAGE_ID`

The webhook-handler service must be running with the same
`MESSENGER_VERIFY_TOKEN`.

### TikTok

Required for signed inbound lead-capture smoke:

- `TIKTOK_CLIENT_SECRET`

Optional:

- `TIKTOK_CHANNEL_ID`
- `TIKTOK_FORM_ID`
- `TIKTOK_ADVERTISER_ID`
- `TIKTOK_OPEN_ID`

The webhook-handler service must be running with the same
`TIKTOK_CLIENT_SECRET` if the smoke is expected to verify signature enforcement.

## Expected Result

The script prints one JSON line per check and a final summary. A launch smoke
passes only when:

- Telegram send succeeds against the tenant bot and target chat.
- Telegram webhook registration succeeds when `TELEGRAM_WEBHOOK_URL` is set.
- Messenger send succeeds against the tenant page and recipient.
- Messenger webhook challenge returns the configured challenge.
- TikTok signed lead-capture payload is accepted and queued.

Set `PROVIDER_SMOKE_REQUIRE_ALL=true` for launch certification so skipped
providers fail the command.

## Safety Notes

- Telegram and Messenger send real provider messages when recipient IDs are
  supplied.
- The script redacts fields named like token/secret/access in its output.
- Do not store production credentials in `.env` files committed to Git.
