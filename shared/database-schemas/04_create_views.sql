-- KME ZayOS Database Views
-- Version 1.0 - Useful Views for Reporting and Analytics

-- =============================================
-- PLATFORM ADMIN VIEWS
-- =============================================

-- Platform overview statistics
CREATE OR REPLACE VIEW platform_overview AS
SELECT 
    (SELECT COUNT(*) FROM tenants WHERE status = 'active') as active_tenants,
    (SELECT COUNT(*) FROM tenants WHERE status = 'pending') as pending_tenants,
    (SELECT COUNT(*) FROM tenants) as total_tenants,
    (SELECT COUNT(*) FROM tenant_users WHERE status = 'active') as total_active_users,
    (SELECT COUNT(*) FROM conversations WHERE DATE(created_at) = CURRENT_DATE) as today_conversations,
    (SELECT COUNT(*) FROM messages WHERE DATE(created_at) = CURRENT_DATE) as today_messages,
    (SELECT COUNT(DISTINCT channel_id) FROM tenant_channels WHERE status = 'active') as active_channels;

-- Tenant summary with plan and usage info
CREATE OR REPLACE VIEW tenant_summary AS
SELECT 
    t.id,
    t.tenant_code,
    t.company_name,
    t.industry,
    t.contact_email,
    t.status,
    t.created_at,
    t.subscription_start_date,
    t.subscription_end_date,
    sp.name as plan_name,
    sp.monthly_price as plan_price,
    sp.max_csrs as plan_max_csrs,
    sp.max_channels as plan_max_channels,
    sp.message_limit as plan_message_limit,
    sp.inbound_message_limit as plan_inbound_message_limit,
    sp.outbound_message_limit as plan_outbound_message_limit,
    COALESCE(t.custom_csr_limit, sp.max_csrs) as effective_csr_limit,
    COALESCE(t.custom_channel_limit, sp.max_channels) as effective_channel_limit,
    COALESCE(t.custom_message_limit, sp.message_limit) as effective_message_limit,
    (SELECT COUNT(*) FROM tenant_users tu WHERE tu.tenant_id = t.id AND tu.status = 'active') as current_csrs,
    (SELECT COUNT(*) FROM tenant_channels tc WHERE tc.tenant_id = t.id AND tc.status = 'active') as current_channels,
    (SELECT COUNT(*) FROM messages m 
     JOIN conversations c ON m.conversation_id = c.id 
     WHERE c.tenant_id = t.id 
     AND DATE_TRUNC('month', m.created_at) = DATE_TRUNC('month', CURRENT_DATE)) as current_month_messages
FROM tenants t
LEFT JOIN subscription_plans sp ON t.subscription_plan_id = sp.id;

-- =============================================
-- TENANT DASHBOARD VIEWS
-- =============================================

-- Conversation summary for tenant dashboard
CREATE OR REPLACE VIEW tenant_conversation_summary AS
SELECT 
    c.tenant_id,
    COUNT(*) as total_conversations,
    COUNT(CASE WHEN c.status = 'open' THEN 1 END) as open_conversations,
    COUNT(CASE WHEN c.status = 'pending' THEN 1 END) as pending_conversations,
    COUNT(CASE WHEN c.status = 'resolved' THEN 1 END) as resolved_conversations,
    COUNT(CASE WHEN c.status = 'closed' THEN 1 END) as closed_conversations,
    COUNT(CASE WHEN DATE(c.created_at) = CURRENT_DATE THEN 1 END) as today_conversations,
    COUNT(CASE WHEN DATE(c.created_at) >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_conversations,
    AVG(CASE WHEN c.resolution_time_seconds IS NOT NULL THEN c.resolution_time_seconds END) as avg_resolution_time_seconds,
    AVG(c.customer_satisfaction_rating) as avg_customer_satisfaction
FROM conversations c
GROUP BY c.tenant_id;

-- CSR performance summary
CREATE OR REPLACE VIEW csr_performance_summary AS
SELECT 
    tu.id as csr_id,
    tu.tenant_id,
    tu.full_name as csr_name,
    tu.email as csr_email,
    tu.department,
    tu.is_online,
    tu.last_seen_at,
    COUNT(c.id) as total_conversations,
    COUNT(CASE WHEN c.status = 'resolved' THEN 1 END) as resolved_conversations,
    COUNT(CASE WHEN DATE(c.created_at) = CURRENT_DATE THEN 1 END) as today_conversations,
    COUNT(CASE WHEN m.sender_type = 'csr' THEN 1 END) as messages_sent,
    AVG(CASE WHEN c.resolution_time_seconds IS NOT NULL THEN c.resolution_time_seconds END) as avg_resolution_time_seconds,
    AVG(c.customer_satisfaction_rating) as avg_customer_satisfaction,
    MAX(m.created_at) as last_message_at
FROM tenant_users tu
LEFT JOIN conversations c ON tu.id = c.assigned_csr_id
LEFT JOIN messages m ON c.id = m.conversation_id AND m.sender_id = tu.id
WHERE tu.role = 'csr'
GROUP BY tu.id, tu.tenant_id, tu.full_name, tu.email, tu.department, tu.is_online, tu.last_seen_at;

-- Channel performance summary
CREATE OR REPLACE VIEW channel_performance_summary AS
SELECT 
    tc.id as channel_id,
    tc.tenant_id,
    tc.channel_type,
    tc.channel_name,
    tc.display_name,
    tc.status,
    COUNT(c.id) as total_conversations,
    COUNT(CASE WHEN DATE(c.created_at) = CURRENT_DATE THEN 1 END) as today_conversations,
    COUNT(CASE WHEN DATE(c.created_at) >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_conversations,
    COUNT(m.id) as total_messages,
    COUNT(CASE WHEN DATE(m.created_at) = CURRENT_DATE THEN 1 END) as today_messages,
    COUNT(DISTINCT cust.id) as unique_customers,
    MAX(c.created_at) as last_conversation_at
FROM tenant_channels tc
LEFT JOIN conversations c ON tc.id = c.channel_id
LEFT JOIN messages m ON c.id = m.conversation_id
LEFT JOIN customers cust ON c.customer_id = cust.id
GROUP BY tc.id, tc.tenant_id, tc.channel_type, tc.channel_name, tc.display_name, tc.status;

-- =============================================
-- CUSTOMER & CONVERSATION VIEWS
-- =============================================

-- Customer profile with conversation history
CREATE OR REPLACE VIEW customer_profile AS
SELECT 
    cust.id as customer_id,
    cust.tenant_id,
    cust.external_id,
    cust.full_name,
    cust.email,
    cust.phone,
    cust.language,
    cust.status,
    cust.first_contact_at,
    cust.last_contact_at,
    cust.total_conversations,
    tc.channel_type,
    tc.display_name as channel_name,
    COUNT(c.id) as conversation_count,
    COUNT(CASE WHEN c.status = 'resolved' THEN 1 END) as resolved_conversations,
    COUNT(o.id) as total_orders,
    COALESCE(SUM(o.total_amount), 0) as total_order_value,
    AVG(c.customer_satisfaction_rating) as avg_satisfaction_rating,
    MAX(c.created_at) as last_conversation_date
FROM customers cust
LEFT JOIN tenant_channels tc ON cust.channel_id = tc.id
LEFT JOIN conversations c ON cust.id = c.customer_id
LEFT JOIN orders o ON cust.id = o.customer_id
GROUP BY cust.id, cust.tenant_id, cust.external_id, cust.full_name, cust.email, 
         cust.phone, cust.language, cust.status, cust.first_contact_at, 
         cust.last_contact_at, cust.total_conversations, tc.channel_type, tc.display_name;

-- Conversation details with participant info
CREATE OR REPLACE VIEW conversation_details AS
SELECT 
    c.id as conversation_id,
    c.tenant_id,
    c.subject,
    c.status,
    c.priority,
    c.created_at,
    c.first_message_at,
    c.last_message_at,
    c.resolved_at,
    c.resolution_time_seconds,
    c.customer_satisfaction_rating,
    cust.full_name as customer_name,
    cust.email as customer_email,
    cust.phone as customer_phone,
    cust.external_id as customer_external_id,
    csr.full_name as csr_name,
    csr.email as csr_email,
    csr.department as csr_department,
    tc.channel_type,
    tc.display_name as channel_name,
    COUNT(m.id) as message_count,
    COUNT(CASE WHEN m.sender_type = 'customer' THEN 1 END) as customer_messages,
    COUNT(CASE WHEN m.sender_type = 'csr' THEN 1 END) as csr_messages
FROM conversations c
LEFT JOIN customers cust ON c.customer_id = cust.id
LEFT JOIN tenant_users csr ON c.assigned_csr_id = csr.id
LEFT JOIN tenant_channels tc ON c.channel_id = tc.id
LEFT JOIN messages m ON c.id = m.conversation_id
GROUP BY c.id, c.tenant_id, c.subject, c.status, c.priority, c.created_at,
         c.first_message_at, c.last_message_at, c.resolved_at, c.resolution_time_seconds,
         c.customer_satisfaction_rating, cust.full_name, cust.email, cust.phone,
         cust.external_id, csr.full_name, csr.email, csr.department,
         tc.channel_type, tc.display_name;

-- =============================================
-- PRODUCT & ORDER VIEWS
-- =============================================

-- Product inventory summary
CREATE OR REPLACE VIEW product_inventory_summary AS
SELECT 
    p.id as product_id,
    p.tenant_id,
    p.name as product_name,
    p.sku,
    p.type,
    p.price,
    p.stock_quantity,
    p.low_stock_threshold,
    p.status,
    pc.name as category_name,
    CASE 
        WHEN p.track_inventory AND p.stock_quantity <= p.low_stock_threshold THEN 'low_stock'
        WHEN p.track_inventory AND p.stock_quantity = 0 THEN 'out_of_stock'
        ELSE 'in_stock'
    END as stock_status,
    COUNT(oi.id) as total_orders,
    COALESCE(SUM(oi.quantity), 0) as total_quantity_sold,
    COALESCE(SUM(oi.total_price), 0) as total_revenue,
    MAX(o.created_at) as last_order_date
FROM products p
LEFT JOIN product_categories pc ON p.category_id = pc.id
LEFT JOIN order_items oi ON p.id = oi.product_id
LEFT JOIN orders o ON oi.order_id = o.id
GROUP BY p.id, p.tenant_id, p.name, p.sku, p.type, p.price, p.stock_quantity,
         p.low_stock_threshold, p.status, pc.name;

-- Order summary with customer and items
CREATE OR REPLACE VIEW order_summary AS
SELECT 
    o.id as order_id,
    o.tenant_id,
    o.order_number,
    o.status,
    o.payment_status,
    o.payment_method,
    o.total_amount,
    o.currency,
    o.created_at,
    o.delivery_date,
    cust.full_name as customer_name,
    cust.email as customer_email,
    cust.phone as customer_phone,
    csr.full_name as created_by_name,
    COUNT(oi.id) as item_count,
    STRING_AGG(DISTINCT p.name, ', ') as product_names,
    c.id as conversation_id,
    tc.channel_type,
    tc.display_name as channel_name
FROM orders o
LEFT JOIN customers cust ON o.customer_id = cust.id
LEFT JOIN tenant_users csr ON o.created_by = csr.id
LEFT JOIN order_items oi ON o.id = oi.order_id
LEFT JOIN products p ON oi.product_id = p.id
LEFT JOIN conversations c ON o.conversation_id = c.id
LEFT JOIN tenant_channels tc ON c.channel_id = tc.id
GROUP BY o.id, o.tenant_id, o.order_number, o.status, o.payment_status,
         o.payment_method, o.total_amount, o.currency, o.created_at, o.delivery_date,
         cust.full_name, cust.email, cust.phone, csr.full_name,
         c.id, tc.channel_type, tc.display_name;

-- =============================================
-- ANALYTICS VIEWS
-- =============================================

-- Daily analytics summary
CREATE OR REPLACE VIEW daily_analytics AS
SELECT 
    t.id as tenant_id,
    t.company_name,
    DATE(CURRENT_DATE) as analytics_date,
    COUNT(DISTINCT c.id) as conversations,
    COUNT(DISTINCT CASE WHEN DATE(c.created_at) = CURRENT_DATE THEN c.id END) as new_conversations,
    COUNT(DISTINCT CASE WHEN c.status = 'resolved' AND DATE(c.resolved_at) = CURRENT_DATE THEN c.id END) as resolved_conversations,
    COUNT(DISTINCT m.id) as messages,
    COUNT(DISTINCT CASE WHEN DATE(m.created_at) = CURRENT_DATE THEN m.id END) as new_messages,
    COUNT(DISTINCT CASE WHEN tu.is_online = TRUE THEN tu.id END) as online_csrs,
    COUNT(DISTINCT o.id) as orders,
    COUNT(DISTINCT CASE WHEN DATE(o.created_at) = CURRENT_DATE THEN o.id END) as new_orders,
    COALESCE(SUM(CASE WHEN DATE(o.created_at) = CURRENT_DATE THEN o.total_amount END), 0) as daily_revenue
FROM tenants t
LEFT JOIN conversations c ON t.id = c.tenant_id
LEFT JOIN messages m ON c.id = m.conversation_id
LEFT JOIN tenant_users tu ON t.id = tu.tenant_id AND tu.role = 'csr'
LEFT JOIN orders o ON t.id = o.tenant_id
WHERE t.status = 'active'
GROUP BY t.id, t.company_name;

-- Weekly performance trends
CREATE OR REPLACE VIEW weekly_performance_trends AS
SELECT 
    tenant_id,
    DATE_TRUNC('week', created_at) as week_start,
    COUNT(DISTINCT id) as conversations,
    COUNT(DISTINCT CASE WHEN status = 'resolved' THEN id END) as resolved_conversations,
    AVG(resolution_time_seconds) as avg_resolution_time,
    AVG(customer_satisfaction_rating) as avg_satisfaction
FROM conversations
WHERE created_at >= CURRENT_DATE - INTERVAL '8 weeks'
GROUP BY tenant_id, DATE_TRUNC('week', created_at)
ORDER BY tenant_id, week_start;

-- Channel usage statistics
CREATE OR REPLACE VIEW channel_usage_stats AS
SELECT 
    tc.tenant_id,
    tc.channel_type,
    COUNT(DISTINCT c.id) as total_conversations,
    COUNT(DISTINCT CASE WHEN DATE(c.created_at) >= CURRENT_DATE - INTERVAL '7 days' THEN c.id END) as week_conversations,
    COUNT(DISTINCT CASE WHEN DATE(c.created_at) = CURRENT_DATE THEN c.id END) as today_conversations,
    COUNT(DISTINCT m.id) as total_messages,
    COUNT(DISTINCT cust.id) as unique_customers,
    AVG(c.resolution_time_seconds) as avg_resolution_time,
    AVG(c.customer_satisfaction_rating) as avg_satisfaction
FROM tenant_channels tc
LEFT JOIN conversations c ON tc.id = c.channel_id
LEFT JOIN messages m ON c.id = m.conversation_id
LEFT JOIN customers cust ON c.customer_id = cust.id
GROUP BY tc.tenant_id, tc.channel_type;

-- =============================================
-- AUDIT & REPORTING VIEWS
-- =============================================

-- Recent platform admin activities
CREATE OR REPLACE VIEW recent_platform_activities AS
SELECT 
    pal.id,
    pal.action,
    pal.resource_type,
    pal.resource_id,
    pal.created_at,
    pa.full_name as admin_name,
    pa.email as admin_email,
    pa.role as admin_role,
    CASE 
        WHEN pal.resource_type = 'tenants' THEN t.company_name
        WHEN pal.resource_type = 'subscription_plans' THEN sp.name
        ELSE pal.resource_type
    END as resource_name
FROM platform_audit_logs pal
LEFT JOIN platform_admins pa ON pal.admin_id = pa.id
LEFT JOIN tenants t ON pal.resource_type = 'tenants' AND pal.resource_id = t.id
LEFT JOIN subscription_plans sp ON pal.resource_type = 'subscription_plans' AND pal.resource_id = sp.id
ORDER BY pal.created_at DESC
LIMIT 100;

-- Recent tenant activities
CREATE OR REPLACE VIEW recent_tenant_activities AS
SELECT 
    tal.id,
    tal.tenant_id,
    tal.action,
    tal.resource_type,
    tal.resource_id,
    tal.created_at,
    tu.full_name as user_name,
    tu.email as user_email,
    tu.role as user_role,
    t.company_name as tenant_name
FROM tenant_audit_logs tal
LEFT JOIN tenant_users tu ON tal.user_id = tu.id
LEFT JOIN tenants t ON tal.tenant_id = t.id
ORDER BY tal.created_at DESC
LIMIT 100;

-- System health overview
CREATE OR REPLACE VIEW system_health_overview AS
SELECT 
    'platform' as component,
    (SELECT COUNT(*) FROM tenants WHERE status = 'active') as active_count,
    (SELECT COUNT(*) FROM tenants WHERE status = 'suspended') as suspended_count,
    (SELECT COUNT(*) FROM tenant_channels WHERE status = 'error') as error_count,
    (SELECT COUNT(*) FROM conversations WHERE status = 'open' AND created_at < CURRENT_DATE - INTERVAL '24 hours') as stale_conversations,
    (SELECT COUNT(*) FROM products WHERE track_inventory = TRUE AND stock_quantity <= low_stock_threshold) as low_stock_products,
    CURRENT_TIMESTAMP as last_updated;
