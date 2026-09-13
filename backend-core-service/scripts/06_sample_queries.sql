-- KME ZayOS Database Sample Queries
-- Version 1.0 - Common Query Examples

-- =============================================
-- PLATFORM ADMIN QUERIES
-- =============================================

-- Get platform overview statistics
SELECT * FROM platform_overview;

-- Find tenants approaching their limits
SELECT 
    ts.company_name,
    ts.plan_name,
    ts.current_csrs,
    ts.effective_csr_limit,
    ts.current_channels,
    ts.effective_channel_limit,
    ts.current_month_messages,
    ts.effective_message_limit,
    CASE 
        WHEN ts.current_csrs >= ts.effective_csr_limit * 0.9 THEN 'CSR limit warning'
        WHEN ts.current_channels >= ts.effective_channel_limit * 0.9 THEN 'Channel limit warning'
        WHEN ts.current_month_messages >= ts.effective_message_limit * 0.9 THEN 'Message limit warning'
        ELSE 'OK'
    END as warning_status
FROM tenant_summary ts
WHERE ts.status = 'active'
ORDER BY ts.company_name;

-- Revenue analysis by subscription plan
SELECT 
    sp.name as plan_name,
    COUNT(t.id) as tenant_count,
    SUM(sp.monthly_price) as monthly_revenue,
    AVG(ta.total_conversations) as avg_conversations_per_tenant
FROM subscription_plans sp
LEFT JOIN tenants t ON sp.id = t.subscription_plan_id AND t.status = 'active'
LEFT JOIN tenant_analytics ta ON t.id = ta.tenant_id AND ta.date = CURRENT_DATE - INTERVAL '1 day'
GROUP BY sp.id, sp.name, sp.monthly_price
ORDER BY monthly_revenue DESC;

-- =============================================
-- TENANT DASHBOARD QUERIES
-- =============================================

-- Get dashboard stats for a specific tenant
SELECT * FROM get_tenant_dashboard_stats('880e8400-e29b-41d4-a716-446655440001'::UUID);

-- CSR workload distribution
SELECT 
    csr_name,
    department,
    total_conversations,
    today_conversations,
    CASE 
        WHEN is_online THEN 'Online'
        WHEN last_seen_at > CURRENT_TIMESTAMP - INTERVAL '1 hour' THEN 'Recently Active'
        ELSE 'Offline'
    END as status,
    avg_resolution_time_seconds / 60 as avg_resolution_minutes
FROM csr_performance_summary
WHERE tenant_id = '880e8400-e29b-41d4-a716-446655440001'
ORDER BY today_conversations DESC, total_conversations DESC;

-- Channel performance comparison
SELECT 
    channel_type,
    display_name,
    total_conversations,
    today_conversations,
    week_conversations,
    unique_customers,
    ROUND(today_conversations::DECIMAL / NULLIF(week_conversations, 0) * 7, 2) as daily_avg_this_week
FROM channel_performance_summary
WHERE tenant_id = '880e8400-e29b-41d4-a716-446655440001'
ORDER BY today_conversations DESC;

-- =============================================
-- CSR DASHBOARD QUERIES
-- =============================================

-- Get assigned conversations for an csr
SELECT 
    cd.conversation_id,
    cd.customer_name,
    cd.customer_phone,
    cd.channel_type,
    cd.subject,
    cd.status,
    cd.priority,
    cd.created_at,
    cd.last_message_at,
    cd.message_count,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - cd.last_message_at))/60 as minutes_since_last_message
FROM conversation_details cd
WHERE cd.csr_email = 'csr1@boom.com.mm'
AND cd.status IN ('open', 'pending')
ORDER BY 
    CASE cd.priority 
        WHEN 'urgent' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'normal' THEN 3 
        WHEN 'low' THEN 4 
    END,
    cd.last_message_at ASC;

-- Get conversation history with messages
SELECT 
    m.id,
    m.sender_type,
    CASE 
        WHEN m.sender_type = 'customer' THEN c.full_name
        WHEN m.sender_type = 'csr' THEN tu.full_name
        ELSE 'System'
    END as sender_name,
    m.message_type,
    m.content,
    m.created_at,
    m.attachments
FROM messages m
JOIN conversations conv ON m.conversation_id = conv.id
LEFT JOIN customers c ON conv.customer_id = c.id
LEFT JOIN tenant_users tu ON m.sender_id = tu.id
WHERE conv.id = '110e8400-e29b-41d4-a716-446655440001'
ORDER BY m.created_at ASC;

-- =============================================
-- CUSTOMER SERVICE QUERIES
-- =============================================

-- Find customer by phone or email
SELECT 
    cp.customer_id,
    cp.full_name,
    cp.email,
    cp.phone,
    cp.channel_name,
    cp.total_conversations,
    cp.total_orders,
    cp.total_order_value,
    cp.avg_satisfaction_rating,
    cp.last_conversation_date
FROM customer_profile cp
WHERE cp.tenant_id = '880e8400-e29b-41d4-a716-446655440001'
AND (cp.phone = '+95911111111' OR cp.email = 'thantzin@email.com');

-- Get customer conversation history
SELECT 
    cd.conversation_id,
    cd.subject,
    cd.status,
    cd.created_at,
    cd.resolved_at,
    cd.csr_name,
    cd.channel_name,
    cd.customer_satisfaction_rating,
    cd.message_count
FROM conversation_details cd
WHERE cd.customer_email = 'thantzin@email.com'
ORDER BY cd.created_at DESC;

-- =============================================
-- PRODUCT & ORDER QUERIES
-- =============================================

-- Low stock alert
SELECT 
    product_name,
    sku,
    category_name,
    stock_quantity,
    low_stock_threshold,
    stock_status,
    total_quantity_sold,
    last_order_date
FROM product_inventory_summary
WHERE tenant_id = '880e8400-e29b-41d4-a716-446655440001'
AND stock_status IN ('low_stock', 'out_of_stock')
ORDER BY stock_quantity ASC;

-- Today's orders
SELECT 
    order_number,
    customer_name,
    customer_phone,
    status,
    payment_status,
    total_amount,
    currency,
    item_count,
    product_names,
    channel_name,
    created_at
FROM order_summary
WHERE tenant_id = '880e8400-e29b-41d4-a716-446655440002'
AND DATE(created_at) = CURRENT_DATE
ORDER BY created_at DESC;

-- =============================================
-- ANALYTICS QUERIES
-- =============================================

-- Weekly performance trend for a tenant
SELECT 
    week_start,
    conversations,
    resolved_conversations,
    ROUND(resolved_conversations::DECIMAL / NULLIF(conversations, 0) * 100, 1) as resolution_rate,
    ROUND(avg_resolution_time / 60, 1) as avg_resolution_minutes,
    ROUND(avg_satisfaction, 2) as avg_satisfaction
FROM weekly_performance_trends
WHERE tenant_id = '880e8400-e29b-41d4-a716-446655440001'
ORDER BY week_start DESC
LIMIT 8;

-- Channel usage comparison
SELECT 
    channel_type,
    total_conversations,
    week_conversations,
    unique_customers,
    ROUND(avg_resolution_time / 60, 1) as avg_resolution_minutes,
    ROUND(avg_satisfaction, 2) as avg_satisfaction,
    ROUND(week_conversations::DECIMAL / NULLIF(total_conversations, 0) * 100, 1) as recent_activity_percentage
FROM channel_usage_stats
WHERE tenant_id = '880e8400-e29b-41d4-a716-446655440001'
ORDER BY week_conversations DESC;

-- =============================================
-- REPORTING QUERIES
-- =============================================

-- Monthly business report
SELECT 
    DATE_TRUNC('month', o.created_at) as month,
    COUNT(DISTINCT o.id) as total_orders,
    SUM(o.total_amount) as total_revenue,
    AVG(o.total_amount) as avg_order_value,
    COUNT(DISTINCT o.customer_id) as unique_customers,
    COUNT(DISTINCT c.id) as total_conversations,
    AVG(c.customer_satisfaction_rating) as avg_satisfaction
FROM orders o
LEFT JOIN conversations c ON o.conversation_id = c.id
WHERE o.tenant_id = '880e8400-e29b-41d4-a716-446655440002'
AND o.created_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', o.created_at)
ORDER BY month DESC;

-- CSR performance report
SELECT 
    csr_name,
    department,
    conversations_handled,
    messages_sent,
    ROUND(avg_response_time_seconds / 60, 1) as avg_response_minutes,
    conversations_resolved,
    ROUND(conversations_resolved::DECIMAL / NULLIF(conversations_handled, 0) * 100, 1) as resolution_rate,
    ROUND(customer_satisfaction_avg, 2) as avg_satisfaction
FROM get_csr_performance_stats('990e8400-e29b-41d4-a716-446655440003'::UUID, CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE) aps
JOIN tenant_users tu ON tu.id = '990e8400-e29b-41d4-a716-446655440003'::UUID;
