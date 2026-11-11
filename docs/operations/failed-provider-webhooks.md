# Failed Provider Webhooks Runbook

Use this runbook when Telegram, Facebook Messenger, TikTok, or another provider webhook stops reaching Commerce OS correctly.

## First Checks

1. Confirm `webhook-handler-service` is healthy:

```bash
curl http://localhost:3003/ready
```

2. Check queue status:

```bash
curl http://localhost:3003/webhooks/queue/stats
```

In the default PM2 runtime, `queue.backend` should be `redis`. If it is
`memory`, confirm `WEBHOOK_QUEUE_BACKEND=redis`, `REDIS_HOST`, and `REDIS_PORT`
are set on `webhook-handler-service`.

3. Inspect dead-lettered events:

```bash
curl http://localhost:3003/webhooks/queue/dead-letters
```

## Common Causes

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `duplicate_provider_webhook` logs | Provider retrying the same event | Confirm event was already processed; no manual action usually needed. |
| `provider_webhook_rate_limited` logs | Provider or attacker exceeded per-channel limit | Raise `WEBHOOK_RATE_LIMIT` only if legitimate traffic exceeds the configured value. |
| Dead letters increasing | Chat ingestion or core forwarding failure | Check `CHAT_INGESTION_URL`, `CORE_API_URL`, and `INTERNAL_SERVICE_TOKEN_SIGNING_KEY`. |
| Readiness fails with Redis connection errors | Redis-backed queue cannot connect | Check Redis availability and `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`. |
| Facebook verification fails | Verify token mismatch | Compare Meta app webhook verify token with the channel credential. |
| Facebook signatures fail | App secret mismatch | Re-enter the correct app secret in the tenant channel. |

## Recovery Steps

1. Fix the underlying configuration or service outage.
2. Capture the dead-letter payloads from `/webhooks/queue/dead-letters`.
3. Re-submit provider webhook payloads only after confirming they are safe to replay.
4. Verify normalized events appear in core conversations/messages.
5. Record the event IDs, provider, channel ID, failure reason, and replay outcome.

## Escalation

Escalate if:

- Dead letters continue after service health is restored.
- Provider signature validation fails for newly generated credentials.
- Core ingestion returns authorization errors after `INTERNAL_SERVICE_TOKEN_SIGNING_KEY` rotation.
- A tenant reports missing conversations or orders after replay.
