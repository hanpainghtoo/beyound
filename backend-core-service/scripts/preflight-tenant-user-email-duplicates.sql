-- Read-only preflight for ZAY-P0-003 before adding global tenant-user email identity uniqueness.
-- Run before migration 1782442400000-AddTenantUserNormalizedEmailIdentity.

SELECT
  lower(btrim(email)) AS normalized_email,
  COUNT(*) AS duplicate_count,
  ARRAY_AGG(id ORDER BY created_at) AS user_ids,
  ARRAY_AGG(tenant_id ORDER BY created_at) AS tenant_ids,
  ARRAY_AGG(status ORDER BY created_at) AS account_statuses,
  ARRAY_AGG(created_at ORDER BY created_at) AS created_dates,
  ARRAY_AGG(last_seen_at ORDER BY created_at) AS last_login_dates
FROM tenant_users
GROUP BY lower(btrim(email))
HAVING COUNT(*) > 1
ORDER BY normalized_email;
