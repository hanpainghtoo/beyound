-- KME ZayOS Database Additional Indexes
-- Version 1.0 - Performance Optimization Indexes

-- =============================================
-- ADDITIONAL PERFORMANCE INDEXES
-- =============================================

-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_tenant_status_created
ON conversations(tenant_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_created
ON messages(conversation_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_tenant_channel_external
ON customers(tenant_id, channel_id, external_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_status_created
ON orders(tenant_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenant_users_tenant_role_status
ON tenant_users(tenant_id, role, status);

-- Partial indexes for active records
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_active_conversations
ON conversations(tenant_id, assigned_csr_id, created_at DESC)
WHERE status IN ('open', 'pending');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_online_csrs
ON tenant_users(tenant_id, last_seen_at DESC)
WHERE is_online = TRUE AND status = 'active';

-- Text search indexes for content
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_content_gin
ON messages USING gin(to_tsvector('english', content));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_name_gin
ON products USING gin(to_tsvector('english', name));

-- Analytics optimization indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenant_analytics_tenant_date
ON tenant_analytics(tenant_id, date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csr_analytics_tenant_csr_date
ON csr_analytics(tenant_id, csr_id, date DESC);

-- Audit log optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_platform_audit_logs_created_action
ON platform_audit_logs(created_at DESC, action);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenant_audit_logs_tenant_created
ON tenant_audit_logs(tenant_id, created_at DESC);
