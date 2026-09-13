-- KME ZayOS Database Functions and Triggers
-- Version 1.0 - Helper Functions and Automation

-- =============================================
-- UTILITY FUNCTIONS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER update_platform_admins_updated_at BEFORE UPDATE ON platform_admins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_channel_templates_updated_at BEFORE UPDATE ON channel_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tenant_rate_limits_updated_at BEFORE UPDATE ON tenant_rate_limits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tenant_users_updated_at BEFORE UPDATE ON tenant_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tenant_roles_updated_at BEFORE UPDATE ON tenant_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tenant_channels_updated_at BEFORE UPDATE ON tenant_channels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_canned_responses_updated_at BEFORE UPDATE ON canned_responses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_categories_updated_at BEFORE UPDATE ON product_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tenant_settings_updated_at BEFORE UPDATE ON tenant_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_platform_settings_updated_at BEFORE UPDATE ON platform_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- BUSINESS LOGIC FUNCTIONS
-- =============================================

-- Function to generate unique order number
CREATE OR REPLACE FUNCTION generate_order_number(tenant_code VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    order_count INTEGER;
    order_number VARCHAR;
BEGIN
    -- Get count of orders for today for this tenant
    SELECT COUNT(*) INTO order_count
    FROM orders o
    JOIN tenants t ON o.tenant_id = t.id
    WHERE t.tenant_code = tenant_code
    AND DATE(o.created_at) = CURRENT_DATE;

    -- Generate order number: TENANT-YYYYMMDD-XXX
    order_number := tenant_code || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD((order_count + 1)::TEXT, 3, '0');

    RETURN order_number;
END;
$$ LANGUAGE plpgsql;

-- Function to generate unique invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number(tenant_code VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    invoice_count INTEGER;
    invoice_number VARCHAR;
BEGIN
    -- Get count of invoices for this month for this tenant
    SELECT COUNT(*) INTO invoice_count
    FROM invoices i
    JOIN tenants t ON i.tenant_id = t.id
    WHERE t.tenant_code = tenant_code
    AND DATE_TRUNC('month', i.created_at) = DATE_TRUNC('month', CURRENT_DATE);

    -- Generate invoice number: INV-TENANT-YYYYMM-XXX
    invoice_number := 'INV-' || tenant_code || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || LPAD((invoice_count + 1)::TEXT, 3, '0');

    RETURN invoice_number;
END;
$$ LANGUAGE plpgsql;

-- Function to check tenant limits
CREATE OR REPLACE FUNCTION check_tenant_limits(tenant_uuid UUID, limit_type VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    tenant_plan subscription_plans%ROWTYPE;
    current_count INTEGER;
    limit_value INTEGER;
BEGIN
    -- Get tenant's subscription plan
    SELECT sp.* INTO tenant_plan
    FROM subscription_plans sp
    JOIN tenants t ON t.subscription_plan_id = sp.id
    WHERE t.id = tenant_uuid;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Check different limit types
    CASE limit_type
        WHEN 'csrs' THEN
            SELECT COUNT(*) INTO current_count FROM tenant_users WHERE tenant_id = tenant_uuid AND status = 'active';
            limit_value := COALESCE(
                (SELECT custom_csr_limit FROM tenants WHERE id = tenant_uuid),
                tenant_plan.max_csrs
            );

        WHEN 'channels' THEN
            SELECT COUNT(*) INTO current_count FROM tenant_channels WHERE tenant_id = tenant_uuid AND status = 'active';
            limit_value := COALESCE(
                (SELECT custom_channel_limit FROM tenants WHERE id = tenant_uuid),
                tenant_plan.max_channels
            );

        WHEN 'messages' THEN
            SELECT COUNT(*) INTO current_count
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE c.tenant_id = tenant_uuid
            AND DATE_TRUNC('month', m.created_at) = DATE_TRUNC('month', CURRENT_DATE);
            limit_value := COALESCE(
                (SELECT custom_message_limit FROM tenants WHERE id = tenant_uuid),
                tenant_plan.message_limit
            );

        ELSE
            RETURN FALSE;
    END CASE;

    RETURN current_count < limit_value;
END;
$$ LANGUAGE plpgsql;

-- Function to update conversation statistics
CREATE OR REPLACE FUNCTION update_conversation_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update customer's total conversations
    IF TG_OP = 'INSERT' THEN
        UPDATE customers
        SET total_conversations = total_conversations + 1,
            last_contact_at = NEW.created_at
        WHERE id = NEW.customer_id;

        -- Set first_contact_at if this is the first conversation
        UPDATE customers
        SET first_contact_at = NEW.created_at
        WHERE id = NEW.customer_id AND first_contact_at IS NULL;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_stats_trigger
    AFTER INSERT ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_conversation_stats();

-- Function to update message timestamps in conversation
CREATE OR REPLACE FUNCTION update_conversation_message_times()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE conversations
        SET last_message_at = NEW.created_at,
            first_message_at = COALESCE(first_message_at, NEW.created_at)
        WHERE id = NEW.conversation_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_message_times_trigger
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_message_times();

-- Function to calculate order totals
CREATE OR REPLACE FUNCTION calculate_order_total()
RETURNS TRIGGER AS $$
DECLARE
    order_record orders%ROWTYPE;
    items_total DECIMAL(10,2);
BEGIN
    -- Get the order
    SELECT * INTO order_record FROM orders WHERE id = NEW.order_id;

    -- Calculate items total
    SELECT COALESCE(SUM(total_price), 0) INTO items_total
    FROM order_items WHERE order_id = NEW.order_id;

    -- Update order totals
    UPDATE orders
    SET subtotal = items_total,
        total_amount = items_total + COALESCE(tax_amount, 0) + COALESCE(shipping_fee, 0) - COALESCE(discount_amount, 0)
    WHERE id = NEW.order_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_order_total_trigger
    AFTER INSERT OR UPDATE OR DELETE ON order_items
    FOR EACH ROW EXECUTE FUNCTION calculate_order_total();

-- Function to update product stock
CREATE OR REPLACE FUNCTION update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Decrease stock when order item is added
        UPDATE products
        SET stock_quantity = stock_quantity - NEW.quantity
        WHERE id = NEW.product_id AND track_inventory = TRUE;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Adjust stock based on quantity change
        UPDATE products
        SET stock_quantity = stock_quantity - (NEW.quantity - OLD.quantity)
        WHERE id = NEW.product_id AND track_inventory = TRUE;

    ELSIF TG_OP = 'DELETE' THEN
        -- Increase stock when order item is removed
        UPDATE products
        SET stock_quantity = stock_quantity + OLD.quantity
        WHERE id = OLD.product_id AND track_inventory = TRUE;

        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_product_stock_trigger
    AFTER INSERT OR UPDATE OR DELETE ON order_items
    FOR EACH ROW EXECUTE FUNCTION update_product_stock();

-- =============================================
-- ANALYTICS FUNCTIONS
-- =============================================

-- Function to get tenant dashboard stats
CREATE OR REPLACE FUNCTION get_tenant_dashboard_stats(tenant_uuid UUID, date_from DATE DEFAULT CURRENT_DATE, date_to DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    total_conversations INTEGER,
    new_conversations INTEGER,
    resolved_conversations INTEGER,
    pending_conversations INTEGER,
    active_csrs INTEGER,
    total_messages INTEGER,
    avg_response_time_seconds INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT c.id)::INTEGER as total_conversations,
        COUNT(DISTINCT CASE WHEN DATE(c.created_at) BETWEEN date_from AND date_to THEN c.id END)::INTEGER as new_conversations,
        COUNT(DISTINCT CASE WHEN c.status = 'resolved' AND DATE(c.resolved_at) BETWEEN date_from AND date_to THEN c.id END)::INTEGER as resolved_conversations,
        COUNT(DISTINCT CASE WHEN c.status IN ('open', 'pending') THEN c.id END)::INTEGER as pending_conversations,
        COUNT(DISTINCT CASE WHEN tu.is_online = TRUE THEN tu.id END)::INTEGER as active_csrs,
        COUNT(DISTINCT CASE WHEN DATE(m.created_at) BETWEEN date_from AND date_to THEN m.id END)::INTEGER as total_messages,
        COALESCE(AVG(
            CASE WHEN DATE(m.created_at) BETWEEN date_from AND date_to AND m.sender_type = 'csr'
            THEN EXTRACT(EPOCH FROM (m.created_at - LAG(m.created_at) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at)))
            END
        )::INTEGER, 0) as avg_response_time_seconds
    FROM conversations c
    LEFT JOIN messages m ON c.id = m.conversation_id
    LEFT JOIN tenant_users tu ON c.assigned_csr_id = tu.id
    WHERE c.tenant_id = tenant_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to get csr performance stats
CREATE OR REPLACE FUNCTION get_csr_performance_stats(csr_uuid UUID, date_from DATE DEFAULT CURRENT_DATE, date_to DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    conversations_handled INTEGER,
    messages_sent INTEGER,
    avg_response_time_seconds INTEGER,
    conversations_resolved INTEGER,
    customer_satisfaction_avg DECIMAL(3,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT c.id)::INTEGER as conversations_handled,
        COUNT(DISTINCT CASE WHEN m.sender_type = 'csr' THEN m.id END)::INTEGER as messages_sent,
        COALESCE(AVG(
            CASE WHEN m.sender_type = 'csr' AND DATE(m.created_at) BETWEEN date_from AND date_to
            THEN EXTRACT(EPOCH FROM (m.created_at - LAG(m.created_at) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at)))
            END
        )::INTEGER, 0) as avg_response_time_seconds,
        COUNT(DISTINCT CASE WHEN c.status = 'resolved' AND DATE(c.resolved_at) BETWEEN date_from AND date_to THEN c.id END)::INTEGER as conversations_resolved,
        AVG(c.customer_satisfaction_rating)::DECIMAL(3,2) as customer_satisfaction_avg
    FROM conversations c
    LEFT JOIN messages m ON c.id = m.conversation_id
    WHERE c.assigned_csr_id = csr_uuid
    AND DATE(c.created_at) BETWEEN date_from AND date_to;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- AUDIT LOG FUNCTIONS
-- =============================================

-- Function to log platform admin actions
CREATE OR REPLACE FUNCTION log_platform_admin_action()
RETURNS TRIGGER AS $$
DECLARE
    admin_id_val UUID;
    action_val VARCHAR(100);
    resource_type_val VARCHAR(50);
    resource_id_val UUID;
    old_values_val JSONB;
    new_values_val JSONB;
BEGIN
    -- Extract admin ID from current session (you'll need to set this in your application)
    admin_id_val := current_setting('app.current_admin_id', true)::UUID;

    -- Determine action and resource info based on table and operation
    resource_type_val := TG_TABLE_NAME;

    IF TG_OP = 'INSERT' THEN
        action_val := 'CREATE';
        resource_id_val := NEW.id;
        new_values_val := to_jsonb(NEW);
        old_values_val := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        action_val := 'UPDATE';
        resource_id_val := NEW.id;
        old_values_val := to_jsonb(OLD);
        new_values_val := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        action_val := 'DELETE';
        resource_id_val := OLD.id;
        old_values_val := to_jsonb(OLD);
        new_values_val := NULL;
    END IF;

    -- Insert audit log (only if admin_id is set)
    IF admin_id_val IS NOT NULL THEN
        INSERT INTO platform_audit_logs (
            admin_id, action, resource_type, resource_id, old_values, new_values
        ) VALUES (
            admin_id_val, action_val, resource_type_val, resource_id_val, old_values_val, new_values_val
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply audit logging to key platform tables
CREATE TRIGGER audit_tenants_trigger
    AFTER INSERT OR UPDATE OR DELETE ON tenants
    FOR EACH ROW EXECUTE FUNCTION log_platform_admin_action();

CREATE TRIGGER audit_subscription_plans_trigger
    AFTER INSERT OR UPDATE OR DELETE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION log_platform_admin_action();

-- Function to log tenant user actions
CREATE OR REPLACE FUNCTION log_tenant_user_action()
RETURNS TRIGGER AS $$
DECLARE
    user_id_val UUID;
    tenant_id_val UUID;
    action_val VARCHAR(100);
    resource_type_val VARCHAR(50);
    resource_id_val UUID;
    old_values_val JSONB;
    new_values_val JSONB;
BEGIN
    -- Extract user and tenant ID from current session
    user_id_val := current_setting('app.current_user_id', true)::UUID;
    tenant_id_val := current_setting('app.current_tenant_id', true)::UUID;

    resource_type_val := TG_TABLE_NAME;

    IF TG_OP = 'INSERT' THEN
        action_val := 'CREATE';
        resource_id_val := NEW.id;
        new_values_val := to_jsonb(NEW);
        old_values_val := NULL;
        -- Use tenant_id from the new record if not set in session
        tenant_id_val := COALESCE(tenant_id_val, NEW.tenant_id);
    ELSIF TG_OP = 'UPDATE' THEN
        action_val := 'UPDATE';
        resource_id_val := NEW.id;
        old_values_val := to_jsonb(OLD);
        new_values_val := to_jsonb(NEW);
        tenant_id_val := COALESCE(tenant_id_val, NEW.tenant_id);
    ELSIF TG_OP = 'DELETE' THEN
        action_val := 'DELETE';
        resource_id_val := OLD.id;
        old_values_val := to_jsonb(OLD);
        new_values_val := NULL;
        tenant_id_val := COALESCE(tenant_id_val, OLD.tenant_id);
    END IF;

    -- Insert audit log (only if user_id and tenant_id are set)
    IF user_id_val IS NOT NULL AND tenant_id_val IS NOT NULL THEN
        INSERT INTO tenant_audit_logs (
            tenant_id, user_id, action, resource_type, resource_id, old_values, new_values
        ) VALUES (
            tenant_id_val, user_id_val, action_val, resource_type_val, resource_id_val, old_values_val, new_values_val
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply audit logging to key tenant tables
CREATE TRIGGER audit_tenant_users_trigger
    AFTER INSERT OR UPDATE OR DELETE ON tenant_users
    FOR EACH ROW EXECUTE FUNCTION log_tenant_user_action();

CREATE TRIGGER audit_products_trigger
    AFTER INSERT OR UPDATE OR DELETE ON products
    FOR EACH ROW EXECUTE FUNCTION log_tenant_user_action();

CREATE TRIGGER audit_orders_trigger
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW EXECUTE FUNCTION log_tenant_user_action();
