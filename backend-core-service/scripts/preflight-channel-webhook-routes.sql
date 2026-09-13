-- Identify tenant channels whose persisted webhook URL is not already routed by
-- the immutable channel UUID. Read-only by default; run before
-- 1782442500000-UseUuidProviderWebhookRoutes.

SELECT
  id AS channel_id,
  tenant_id,
  channel_type,
  channel_name,
  status,
  webhook_url,
  CASE
    WHEN webhook_url IS NULL OR btrim(webhook_url) = '' THEN 'missing_webhook_url'
    WHEN btrim(webhook_url) ~ ('/webhooks/[^/?#]+/' || id::text || '$') THEN 'uuid_route'
    WHEN btrim(webhook_url) ~ '/webhooks/[^/?#]+/[^/?#]+$' THEN 'legacy_or_non_uuid_route'
    ELSE 'unrecognized_route_shape'
  END AS route_status,
  created_at,
  updated_at
FROM tenant_channels
WHERE webhook_url IS NULL
  OR btrim(webhook_url) = ''
  OR NOT btrim(webhook_url) ~ ('/webhooks/[^/?#]+/' || id::text || '$')
ORDER BY tenant_id, channel_type, channel_name;
