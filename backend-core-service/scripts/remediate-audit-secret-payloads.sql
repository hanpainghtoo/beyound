-- Reviewed remediation script for historical audit payloads that may contain secret-bearing fields.
-- Do not run blindly. First identify affected rows, export/backup required audit metadata,
-- then run inside an approved maintenance window.

-- Identify platform audit records with likely secret-bearing payload fields.
SELECT id, action, resource_type, resource_id, created_at
FROM platform_audit_logs
WHERE old_values::text ~* '(password_hash|passwordHash|inviteUrl|inviteToken|resetUrl|accessToken|refreshToken|credentials|secret|apiKey)'
   OR new_values::text ~* '(password_hash|passwordHash|inviteUrl|inviteToken|resetUrl|accessToken|refreshToken|credentials|secret|apiKey)';

-- Identify tenant audit records with likely secret-bearing payload fields.
SELECT id, tenant_id, user_id, action, resource_type, resource_id, created_at
FROM tenant_audit_logs
WHERE old_values::text ~* '(password_hash|passwordHash|inviteUrl|inviteToken|resetUrl|accessToken|refreshToken|credentials|secret|apiKey)'
   OR new_values::text ~* '(password_hash|passwordHash|inviteUrl|inviteToken|resetUrl|accessToken|refreshToken|credentials|secret|apiKey)';

-- Safe automatic field-level JSONB redaction is schema/data-shape dependent for historical rows.
-- Recommended remediation:
-- 1. Preserve id, action, actor, tenant, resource type/id, timestamps, ip/user-agent.
-- 2. Replace old_values/new_values for identified rows with a minimal marker payload.
-- 3. Record the remediation action in the change-management log.

-- Example update after review:
-- UPDATE tenant_audit_logs
-- SET old_values = CASE WHEN old_values IS NULL THEN NULL ELSE '{"redacted": true, "reason": "historical_secret_payload_remediation"}'::jsonb END,
--     new_values = CASE WHEN new_values IS NULL THEN NULL ELSE '{"redacted": true, "reason": "historical_secret_payload_remediation"}'::jsonb END
-- WHERE id IN (...reviewed tenant audit ids...);

-- UPDATE platform_audit_logs
-- SET old_values = CASE WHEN old_values IS NULL THEN NULL ELSE '{"redacted": true, "reason": "historical_secret_payload_remediation"}'::jsonb END,
--     new_values = CASE WHEN new_values IS NULL THEN NULL ELSE '{"redacted": true, "reason": "historical_secret_payload_remediation"}'::jsonb END
-- WHERE id IN (...reviewed platform audit ids...);
