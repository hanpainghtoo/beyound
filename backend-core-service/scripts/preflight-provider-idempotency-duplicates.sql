-- Read-only preflight for ZAY-INT-002 provider idempotency constraints.
-- Run before migration 1782442600000-AddProviderInboundIdempotency.

WITH duplicate_messages AS (
  SELECT
    tc.channel_type AS provider,
    c.tenant_id,
    c.channel_id,
    m.external_message_id,
    COUNT(*) AS duplicate_count,
    ARRAY_AGG(m.id ORDER BY m.created_at) AS message_ids,
    ARRAY_AGG(m.created_at ORDER BY m.created_at) AS created_at_values
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  LEFT JOIN tenant_channels tc ON tc.id = c.channel_id
  WHERE m.external_message_id IS NOT NULL
  GROUP BY tc.channel_type, c.tenant_id, c.channel_id, m.external_message_id
  HAVING COUNT(*) > 1
)
SELECT
  'messages' AS duplicate_type,
  provider,
  tenant_id,
  channel_id,
  external_message_id AS external_id,
  duplicate_count,
  message_ids AS record_ids,
  created_at_values,
  (
    SELECT COUNT(*)
    FROM tenant_usage_events tue
    WHERE tue.metadata->>'externalMessageId' = duplicate_messages.external_message_id
      AND tue.channel_id = duplicate_messages.channel_id
  ) AS related_usage_event_count
FROM duplicate_messages
UNION ALL
SELECT
  'customers' AS duplicate_type,
  tc.channel_type AS provider,
  c.tenant_id,
  c.channel_id,
  c.external_id AS external_id,
  COUNT(*) AS duplicate_count,
  ARRAY_AGG(c.id ORDER BY c.created_at) AS record_ids,
  ARRAY_AGG(c.created_at ORDER BY c.created_at) AS created_at_values,
  0 AS related_usage_event_count
FROM customers c
LEFT JOIN tenant_channels tc ON tc.id = c.channel_id
WHERE c.external_id IS NOT NULL
GROUP BY tc.channel_type, c.tenant_id, c.channel_id, c.external_id
HAVING COUNT(*) > 1
UNION ALL
SELECT
  'conversations' AS duplicate_type,
  tc.channel_type AS provider,
  c.tenant_id,
  c.channel_id,
  c.conversation_id AS external_id,
  COUNT(*) AS duplicate_count,
  ARRAY_AGG(c.id ORDER BY c.created_at) AS record_ids,
  ARRAY_AGG(c.created_at ORDER BY c.created_at) AS created_at_values,
  0 AS related_usage_event_count
FROM conversations c
LEFT JOIN tenant_channels tc ON tc.id = c.channel_id
WHERE c.conversation_id IS NOT NULL
GROUP BY tc.channel_type, c.tenant_id, c.channel_id, c.conversation_id
HAVING COUNT(*) > 1
ORDER BY duplicate_type, provider, tenant_id, channel_id, external_id;
