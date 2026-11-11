-- Commerce simplification preflight.
-- Read-only by construction: no DDL/DML; run against a local, staging, or
-- production snapshot only after reviewing the target connection.
BEGIN READ ONLY;

SELECT current_database() AS database_name,
       current_user AS database_user,
       current_setting('transaction_read_only') AS transaction_read_only,
       clock_timestamp() AS observed_at;

\echo 'TOTAL ORDERS'
SELECT count(*) AS total_orders FROM orders;

\echo 'LEGACY STATUS COUNTS'
SELECT status, count(*) AS orders
FROM orders
GROUP BY status
ORDER BY status;

\echo 'LEGACY PAYMENT STATUS COUNTS'
SELECT payment_status, count(*) AS orders
FROM orders
GROUP BY payment_status
ORDER BY payment_status;

\echo 'PARTIALLY PAID / REFUNDED / RETURNED / FAILED DELIVERY'
SELECT count(*) FILTER (WHERE payment_status = 'partially_paid') AS partially_paid,
       count(*) FILTER (WHERE payment_status = 'refunded') AS refunded,
       coalesce(sum(paid_amount) FILTER (WHERE payment_status = 'partially_paid'), 0) AS partially_paid_amount,
       coalesce(sum(paid_amount) FILTER (WHERE payment_status = 'refunded'), 0) AS refunded_paid_amount,
       count(*) FILTER (WHERE status = 'returned') AS returned_status,
       count(*) FILTER (WHERE status = 'failed_delivery') AS failed_delivery_status,
       count(*) FILTER (WHERE payment_status = 'returned') AS returned_payment_status,
       count(*) FILTER (WHERE payment_status = 'failed_delivery') AS failed_delivery_payment_status,
       count(*) FILTER (WHERE status = 'cod_collected') AS cod_collected_order_status
FROM orders;

\echo 'UNMAPPED LEGACY STATUS VALUES (MUST BE EMPTY)'
SELECT DISTINCT status
FROM orders
WHERE status <> ALL(ARRAY[
  'new', 'pending', 'pending_payment', 'payment_submitted', 'confirmed',
  'preparing', 'packed', 'processing', 'out_for_delivery', 'delivered',
  'failed_delivery', 'cod_collected', 'cancelled', 'returned', 'expired',
  'rejected'
]::text[])
ORDER BY status;

\echo 'UNMAPPED LEGACY PAYMENT STATUS VALUES (MUST BE EMPTY)'
SELECT DISTINCT payment_status
FROM orders
WHERE payment_status <> ALL(ARRAY[
  'pending', 'unpaid', 'partially_paid', 'paid', 'failed', 'refunded',
  'cod_pending', 'cod_collected'
]::text[])
ORDER BY payment_status;

\echo 'EXPIRED STATUS SPLIT BY CREATED_BY'
SELECT created_by IS NULL AS created_by_null, count(*) AS orders
FROM orders
WHERE status = 'expired'
GROUP BY created_by IS NULL
ORDER BY created_by IS NULL;

\echo 'PENDING-LIKE ROWS WITH EXPIRES_AT AND NON-NULL CREATED_BY'
SELECT count(*) AS orders
FROM orders
WHERE status IN ('pending', 'pending_payment', 'payment_submitted', 'new', 'rejected')
  AND expires_at IS NOT NULL
  AND created_by IS NOT NULL;

\echo 'INFORMATIONAL: DUPLICATE BOT CANDIDATE PENDING/UNPAID GROUPS (NO UNIQUE INDEX UNDER OPTION A)'
WITH mapped AS (
  SELECT tenant_id,
         customer_id,
         created_by,
         CASE
           WHEN status IN ('new', 'pending', 'pending_payment', 'payment_submitted') THEN 'pending'
           WHEN status IN ('rejected') THEN 'rejected'
           ELSE status
         END AS mapped_status,
         CASE
           WHEN status = 'cod_collected' OR payment_status IN ('paid', 'cod_collected') THEN 'paid'
           ELSE 'unpaid'
         END AS mapped_payment_status
  FROM orders
)
SELECT 'informational_only' AS finding,
       tenant_id,
       customer_id,
       count(*) AS orders,
       count(*) FILTER (WHERE created_by IS NULL) AS bot_candidate_orders
FROM mapped
WHERE mapped_status = 'pending'
  AND mapped_payment_status = 'unpaid'
  AND customer_id IS NOT NULL
  AND created_by IS NULL
GROUP BY tenant_id, customer_id
HAVING count(*) > 1
ORDER BY orders DESC, tenant_id, customer_id;

\echo 'INFORMATIONAL: ALL DUPLICATE PENDING/UNPAID GROUPS FOR REVIEW (NO UNIQUE INDEX UNDER OPTION A)'
WITH mapped AS (
  SELECT tenant_id,
         customer_id,
         CASE
           WHEN status IN ('new', 'pending', 'pending_payment', 'payment_submitted') THEN 'pending'
           ELSE status
         END AS mapped_status,
         CASE
           WHEN status = 'cod_collected' OR payment_status IN ('paid', 'cod_collected') THEN 'paid'
           ELSE 'unpaid'
         END AS mapped_payment_status
  FROM orders
)
SELECT 'informational_only' AS finding, tenant_id, customer_id, count(*) AS orders
FROM mapped
WHERE mapped_status = 'pending'
  AND mapped_payment_status = 'unpaid'
  AND customer_id IS NOT NULL
GROUP BY tenant_id, customer_id
HAVING count(*) > 1
ORDER BY orders DESC, tenant_id, customer_id;

\echo 'SHIPPING ADDRESS SHAPES'
SELECT coalesce(jsonb_typeof(shipping_address), 'sql_null') AS shape,
       count(*) AS orders
FROM orders
GROUP BY coalesce(jsonb_typeof(shipping_address), 'sql_null')
ORDER BY shape;

\echo 'SHIPPING ADDRESS DISTINCT KEYS'
SELECT key, count(*) AS rows_with_key
FROM orders o
CROSS JOIN LATERAL jsonb_object_keys(
  CASE WHEN jsonb_typeof(o.shipping_address) = 'object'
       THEN o.shipping_address ELSE '{}'::jsonb END
) AS key
GROUP BY key
ORDER BY key;

\echo 'SHIPPING ADDRESS OBJECT KEY SETS'
SELECT o.id,
       array_to_string(array_agg(key ORDER BY key), ',') AS sorted_keys
FROM orders o
CROSS JOIN LATERAL jsonb_object_keys(
  CASE WHEN jsonb_typeof(o.shipping_address) = 'object'
       THEN o.shipping_address ELSE '{}'::jsonb END
) AS key
GROUP BY o.id
ORDER BY o.id;

\echo 'STATUS_HISTORY SOURCES FOR CREATED_BY_NULL ORDERS'
SELECT coalesce(h->>'source', '<missing>') AS source, count(*) AS entries
FROM orders o
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(o.status_history) = 'array'
       THEN o.status_history ELSE '[]'::jsonb END
) AS h
WHERE o.created_by IS NULL
GROUP BY coalesce(h->>'source', '<missing>')
ORDER BY source;

\echo 'AMBIGUOUS EXPIRY CANDIDATES (EXACT MIGRATION PREDICATE)'
SELECT id, order_number, status, payment_status, expires_at, created_by, payment_method
FROM orders
WHERE expires_at IS NOT NULL
  AND created_by IS NULL
  AND status IN ('pending', 'pending_payment', 'payment_submitted', 'new', 'rejected')
  AND NOT (
    jsonb_typeof(status_history) = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(status_history) AS h
      WHERE h->>'source' = 'telegram'
    )
  )
ORDER BY created_at, id;

ROLLBACK;
