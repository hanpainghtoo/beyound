-- KME ZayOS Database Schema
-- Version 1.0 - Initial Schema Creation

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PLATFORM ADMIN TABLES
-- =============================================

-- Platform admin users
CREATE TABLE platform_admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'ops_admin', -- super_admin, ops_admin, it_admin, finance_viewer, read_only
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, inactive, suspended
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscription plans
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    monthly_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    -- @deprecated legacy purchased-period length; new plans use calendar months
    duration_days INTEGER NOT NULL DEFAULT 30,
    -- @deprecated legacy combined|directional selector; new plans use independent limits
    message_quota_mode VARCHAR(20) NOT NULL DEFAULT 'combined',
    max_csrs INTEGER NOT NULL DEFAULT 5,
    max_channels INTEGER NOT NULL DEFAULT 3,
    -- @deprecated legacy aggregate cap; new enforcement uses the directional columns below
    message_limit INTEGER DEFAULT NULL,
    -- Monthly inbound message limit; NULL = unlimited, 0 = blocked
    inbound_message_limit INTEGER DEFAULT NULL,
    -- Monthly outbound message limit; NULL = unlimited, 0 = blocked
    outbound_message_limit INTEGER DEFAULT NULL,
    allowed_providers TEXT[] NOT NULL DEFAULT '{messenger}', -- messenger, viber, telegram, tiktok
    api_limit INTEGER DEFAULT NULL, -- period-scoped API cap; NULL = unlimited
    storage_limit_gb INTEGER NOT NULL DEFAULT 1,
    features JSONB DEFAULT '{}', -- JSON array of features
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, inactive, archived
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Channel templates for platform-wide configuration
CREATE TABLE channel_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_type VARCHAR(50) NOT NULL, -- messenger, viber, telegram, tiktok
    template_name VARCHAR(100) NOT NULL,
    app_id VARCHAR(255),
    bot_token VARCHAR(500),
    callback_url VARCHAR(500),
    webhook_events JSONB DEFAULT '[]', -- array of enabled events
    default_welcome_message TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    configuration JSONB DEFAULT '{}', -- additional channel-specific config
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- TENANT MANAGEMENT
-- =============================================

-- Tenants (Customer companies)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_code VARCHAR(50) UNIQUE NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    industry VARCHAR(100),
    business_type VARCHAR(100),
    contact_person VARCHAR(255),
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(50),
    website VARCHAR(255),
    address TEXT,
    logo_url VARCHAR(500),
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, active, suspended, rejected, deleted
    subscription_plan_id UUID REFERENCES subscription_plans(id),
    subscription_start_date DATE,
    subscription_end_date DATE,
    custom_csr_limit INTEGER,
    custom_channel_limit INTEGER,
    custom_message_limit INTEGER,
    timezone VARCHAR(50) DEFAULT 'Asia/Yangon',
    language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    approved_by UUID REFERENCES platform_admins(id)
);

-- Rate limiting settings per tenant
CREATE TABLE tenant_rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    messages_per_minute INTEGER DEFAULT 60,
    api_requests_per_minute INTEGER DEFAULT 100,
    webhook_events_per_minute INTEGER DEFAULT 50,
    throttling_mode VARCHAR(20) DEFAULT 'soft_warning', -- hard_limit, soft_warning, grace_limit
    grace_limit_percentage INTEGER DEFAULT 20,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- USER MANAGEMENT
-- =============================================

-- Tenant users (Customer Admin, Supervisors, csrs)
CREATE TABLE tenant_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    normalized_email VARCHAR(320) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL DEFAULT 'csr', -- admin, supervisor, csr
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, inactive, suspended
    is_online BOOLEAN DEFAULT FALSE,
    last_seen_at TIMESTAMP,
    avatar_url VARCHAR(500),
    department VARCHAR(100),
    employee_id VARCHAR(50),
    hire_date DATE,
    permissions JSONB DEFAULT '{}', -- custom permissions override
    notification_preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, email)
);

-- Custom roles for tenants
CREATE TABLE tenant_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    role_name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '{}', -- permission matrix
    is_system_role BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, role_name)
);

-- =============================================
-- CHANNEL MANAGEMENT
-- =============================================

-- Tenant channels (connected messaging platforms)
CREATE TABLE tenant_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    channel_type VARCHAR(50) NOT NULL, -- messenger, viber, telegram, tiktok
    channel_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, inactive, error, pending
    configuration JSONB NOT NULL DEFAULT '{}', -- channel-specific settings
    credentials JSONB DEFAULT '{}', -- encrypted tokens/keys
    webhook_url VARCHAR(500),
    welcome_message TEXT,
    auto_reply_enabled BOOLEAN DEFAULT FALSE,
    auto_reply_message TEXT,
    assignment_rule VARCHAR(50) DEFAULT 'round_robin', -- round_robin, least_busy, manual
    business_hours JSONB DEFAULT '{}', -- operating hours
    notification_settings JSONB DEFAULT '{}',
    last_sync_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Channel analytics
CREATE TABLE channel_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES tenant_channels(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    messages_received INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    conversations_started INTEGER DEFAULT 0,
    conversations_resolved INTEGER DEFAULT 0,
    avg_response_time_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, channel_id, date)
);

-- =============================================
-- CUSTOMER MANAGEMENT
-- =============================================

-- Customers (end users chatting with csrs)
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    external_id VARCHAR(255), -- platform-specific user ID
    channel_id UUID REFERENCES tenant_channels(id),
    full_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    avatar_url VARCHAR(500),
    language VARCHAR(10) DEFAULT 'en',
    timezone VARCHAR(50),
    location JSONB, -- {country, city, lat, lng}
    profile_data JSONB DEFAULT '{}', -- additional customer data
    tags JSONB DEFAULT '[]', -- customer tags
    notes TEXT,
    status VARCHAR(20) DEFAULT 'active', -- active, blocked, archived
    first_contact_at TIMESTAMP,
    last_contact_at TIMESTAMP,
    total_conversations INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, channel_id, external_id)
);

-- =============================================
-- CONVERSATION MANAGEMENT
-- =============================================

-- Conversations
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES tenant_channels(id) ON DELETE CASCADE,
    assigned_csr_id UUID REFERENCES tenant_users(id),
    conversation_id VARCHAR(255), -- external conversation ID from platform
    subject VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'open', -- open, pending, resolved, closed
    priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}', -- additional conversation data
    first_message_at TIMESTAMP,
    last_message_at TIMESTAMP,
    resolved_at TIMESTAMP,
    resolution_time_seconds INTEGER,
    customer_satisfaction_rating INTEGER, -- 1-5 rating
    customer_feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL, -- customer, csr, system
    sender_id UUID, -- references tenant_users(id) for csrs, customers(id) for customers
    message_type VARCHAR(50) DEFAULT 'text', -- text, image, video, audio, file, location, order, invoice
    content TEXT,
    attachments JSONB DEFAULT '[]', -- array of attachment objects
    metadata JSONB DEFAULT '{}', -- platform-specific message data
    external_message_id VARCHAR(255), -- platform message ID
    reply_to_message_id UUID REFERENCES messages(id),
    status VARCHAR(20) DEFAULT 'sent', -- sent, delivered, read, failed
    is_internal BOOLEAN DEFAULT FALSE, -- internal csr notes
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Message attachments
CREATE TABLE message_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_size INTEGER,
    file_url VARCHAR(500) NOT NULL,
    thumbnail_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- CANNED RESPONSES
-- =============================================

-- Canned response categories
CREATE TABLE canned_response_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7), -- hex color
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, name)
);

-- Canned responses
CREATE TABLE canned_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES canned_response_categories(id),
    title VARCHAR(255) NOT NULL,
    shortcut VARCHAR(50),
    content TEXT NOT NULL,
    tags JSONB DEFAULT '[]',
    visibility VARCHAR(20) DEFAULT 'public', -- public, private, team
    created_by UUID REFERENCES tenant_users(id),
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, shortcut)
);

-- =============================================
-- PRODUCT & SERVICE CATALOG
-- =============================================

-- Product categories
CREATE TABLE product_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_category_id UUID REFERENCES product_categories(id),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, name)
);

-- Products and services
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES product_categories(id),
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    type VARCHAR(20) NOT NULL DEFAULT 'product', -- product, service
    description TEXT,
    short_description TEXT,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    cost_price DECIMAL(10,2),
    stock_quantity INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 5,
    track_inventory BOOLEAN DEFAULT TRUE,
    weight DECIMAL(8,2),
    dimensions JSONB, -- {length, width, height, unit}
    images JSONB DEFAULT '[]', -- array of image URLs
    tags JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, out_of_stock
    is_featured BOOLEAN DEFAULT FALSE,
    seo_title VARCHAR(255),
    seo_description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, sku)
);

-- =============================================
-- ORDER & INVOICE MANAGEMENT
-- =============================================

-- Orders
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id),
    conversation_id UUID REFERENCES conversations(id),
    order_number VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, confirmed, processing, shipped, delivered, cancelled, refunded
    payment_status VARCHAR(20) DEFAULT 'pending', -- pending, paid, failed, refunded
    payment_method VARCHAR(50), -- cod, online, bank_transfer
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    shipping_fee DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'MMK',
    notes TEXT,
    shipping_address JSONB,
    billing_address JSONB,
    delivery_date DATE,
    tracking_number VARCHAR(100),
    created_by UUID REFERENCES tenant_users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, order_number)
);

-- Order items
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    product_sku VARCHAR(100),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id),
    customer_id UUID REFERENCES customers(id),
    invoice_number VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, sent, paid, overdue, cancelled
    issue_date DATE NOT NULL,
    due_date DATE,
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'MMK',
    notes TEXT,
    terms_and_conditions TEXT,
    payment_instructions TEXT,
    created_by UUID REFERENCES tenant_users(id),
    sent_at TIMESTAMP,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, invoice_number)
);

-- Invoice items
CREATE TABLE invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- SYSTEM SETTINGS & CONFIGURATION
-- =============================================

-- Tenant settings
CREATE TABLE tenant_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSONB,
    setting_type VARCHAR(50) DEFAULT 'string', -- string, number, boolean, json, array
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE, -- can be accessed by non-admin users
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, setting_key)
);

-- Platform settings
CREATE TABLE platform_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value JSONB,
    setting_type VARCHAR(50) DEFAULT 'string',
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- AUDIT LOGS
-- =============================================

-- Audit logs for platform admin actions
CREATE TABLE platform_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES platform_admins(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50), -- tenant, user, plan, etc.
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs for tenant actions
CREATE TABLE tenant_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES tenant_users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- ANALYTICS & REPORTING
-- =============================================

-- Daily tenant analytics
CREATE TABLE tenant_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_conversations INTEGER DEFAULT 0,
    new_conversations INTEGER DEFAULT 0,
    resolved_conversations INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    avg_response_time_seconds INTEGER DEFAULT 0,
    avg_resolution_time_seconds INTEGER DEFAULT 0,
    active_csrs INTEGER DEFAULT 0,
    customer_satisfaction_avg DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, date)
);

-- CSR performance analytics
CREATE TABLE csr_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    csr_id UUID REFERENCES tenant_users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    conversations_handled INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    avg_response_time_seconds INTEGER DEFAULT 0,
    avg_resolution_time_seconds INTEGER DEFAULT 0,
    customer_satisfaction_avg DECIMAL(3,2),
    online_time_minutes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, csr_id, date)
);

-- =============================================
-- NOTIFICATIONS
-- =============================================

-- System notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES tenant_users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- info, warning, error, success
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    action_url VARCHAR(500),
    is_read BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Tenant indexes
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_subscription_plan ON tenants(subscription_plan_id);
CREATE INDEX idx_tenants_created_at ON tenants(created_at);

-- User indexes
CREATE INDEX idx_tenant_users_tenant_id ON tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_email ON tenant_users(email);
CREATE UNIQUE INDEX uq_tenant_users_normalized_email ON tenant_users(normalized_email);
CREATE INDEX idx_tenant_users_normalized_email_lookup ON tenant_users(normalized_email, status);
CREATE INDEX idx_tenant_users_role ON tenant_users(role);
CREATE INDEX idx_tenant_users_status ON tenant_users(status);

-- Channel indexes
CREATE INDEX idx_tenant_channels_tenant_id ON tenant_channels(tenant_id);
CREATE INDEX idx_tenant_channels_type ON tenant_channels(channel_type);
CREATE INDEX idx_tenant_channels_status ON tenant_channels(status);

-- Customer indexes
CREATE INDEX idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX idx_customers_channel_id ON customers(channel_id);
CREATE INDEX idx_customers_external_id ON customers(external_id);
CREATE INDEX idx_customers_email ON customers(email);

-- Conversation indexes
CREATE INDEX idx_conversations_tenant_id ON conversations(tenant_id);
CREATE INDEX idx_conversations_customer_id ON conversations(customer_id);
CREATE INDEX idx_conversations_csr_id ON conversations(assigned_csr_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);
CREATE INDEX idx_conversations_channel_id ON conversations(channel_id);

-- Message indexes
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_tenant_id ON messages(tenant_id);
CREATE INDEX idx_messages_sender_type ON messages(sender_type);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Product indexes
CREATE INDEX idx_products_tenant_id ON products(tenant_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_status ON products(status);

-- Order indexes
CREATE INDEX idx_orders_tenant_id ON orders(tenant_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_orders_order_number ON orders(order_number);

-- Analytics indexes
CREATE INDEX idx_tenant_analytics_tenant_date ON tenant_analytics(tenant_id, date);
CREATE INDEX idx_csr_analytics_tenant_csr_date ON csr_analytics(tenant_id, csr_id, date);
CREATE INDEX idx_channel_analytics_tenant_channel_date ON channel_analytics(tenant_id, channel_id, date);

-- Audit log indexes
CREATE INDEX idx_platform_audit_logs_admin_id ON platform_audit_logs(admin_id);
CREATE INDEX idx_platform_audit_logs_created_at ON platform_audit_logs(created_at);
CREATE INDEX idx_tenant_audit_logs_tenant_id ON tenant_audit_logs(tenant_id);
CREATE INDEX idx_tenant_audit_logs_user_id ON tenant_audit_logs(user_id);
CREATE INDEX idx_tenant_audit_logs_created_at ON tenant_audit_logs(created_at);

-- Notification indexes
CREATE INDEX idx_notifications_tenant_user ON notifications(tenant_id, user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
