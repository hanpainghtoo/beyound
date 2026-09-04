-- KME ZayOS Database Seed Data
-- Version 1.0 - Initial Data Population

-- =============================================
-- PLATFORM ADMIN SEED DATA
-- =============================================

-- Insert platform admin users
INSERT INTO platform_admins (id, full_name, email, password_hash, role, status) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Super Admin', 'admin@kme.io', '$2b$10$rQZ8kqVZ8kqVZ8kqVZ8kqO', 'super_admin', 'active'),
('550e8400-e29b-41d4-a716-446655440002', 'Operations Manager', 'ops@kme.io', '$2b$10$rQZ8kqVZ8kqVZ8kqVZ8kqO', 'ops_admin', 'active'),
('550e8400-e29b-41d4-a716-446655440003', 'IT Administrator', 'it@kme.io', '$2b$10$rQZ8kqVZ8kqVZ8kqVZ8kqO', 'it_admin', 'active'),
('550e8400-e29b-41d4-a716-446655440004', 'Finance Viewer', 'finance@kme.io', '$2b$10$rQZ8kqVZ8kqVZ8kqVZ8kqO', 'finance_viewer', 'active');

-- Insert subscription plans
INSERT INTO subscription_plans (id, name, description, monthly_price, max_csrs, max_channels, message_limit, api_limit, storage_limit_gb, features, status) VALUES
('660e8400-e29b-41d4-a716-446655440001', 'Starter', 'Perfect for small businesses getting started', 50000.00, 3, 2, 1000, 2000, 1, '["basic_chat", "email_support"]', 'active'),
('660e8400-e29b-41d4-a716-446655440002', 'Professional', 'Ideal for growing businesses', 100000.00, 10, 5, 5000, 10000, 5, '["basic_chat", "canned_responses", "analytics", "priority_support"]', 'active'),
('660e8400-e29b-41d4-a716-446655440003', 'Business', 'Advanced features for established companies', 200000.00, 25, 10, 15000, 25000, 15, '["basic_chat", "canned_responses", "analytics", "priority_support", "custom_branding", "api_access"]', 'active'),
('660e8400-e29b-41d4-a716-446655440004', 'Enterprise', 'Full-featured solution for large organizations', 500000.00, 100, 20, 50000, 100000, 50, '["all_features", "dedicated_support", "custom_integrations", "sla_guarantee"]', 'active');

-- Insert channel templates
INSERT INTO channel_templates (id, channel_type, template_name, callback_url, webhook_events, default_welcome_message, status, configuration) VALUES
('770e8400-e29b-41d4-a716-446655440001', 'messenger', 'Facebook Messenger Default', 'https://api.kme.io/webhooks/messenger', '["messages", "messaging_postbacks", "messaging_deliveries"]', 'Hello! Welcome to our customer support. How can we help you today?', 'active', '{"verify_token": "kme_messenger_verify", "api_version": "v18.0"}'),
('770e8400-e29b-41d4-a716-446655440002', 'viber', 'Viber Business Default', 'https://api.kme.io/webhooks/viber', '["message", "delivered", "seen"]', 'Hi there! 👋 Thanks for contacting us. How can we assist you?', 'active', '{"min_api_version": 7}'),
('770e8400-e29b-41d4-a716-446655440003', 'telegram', 'Telegram Bot Default', 'https://api.kme.io/webhooks/telegram', '["message", "callback_query"]', 'Welcome to our support bot! 🤖 Please describe your issue and we''ll help you right away.', 'active', '{"parse_mode": "HTML"}'),
('770e8400-e29b-41d4-a716-446655440004', 'tiktok', 'TikTok Business Default', 'https://api.kme.io/webhooks/tiktok', '["message"]', 'Hey! 🎵 Thanks for reaching out. Our team is here to help!', 'active', '{}');

-- =============================================
-- SAMPLE TENANT DATA
-- =============================================

-- Insert sample tenants
INSERT INTO tenants (id, tenant_code, company_name, industry, business_type, contact_person, contact_email, contact_phone, website, address, description, status, subscription_plan_id, subscription_start_date, subscription_end_date, timezone, language, approved_at, approved_by) VALUES
('880e8400-e29b-41d4-a716-446655440001', 'BOOM001', 'BOOM Electronics', 'Electronics', 'Retail', 'Mg Thura', 'admin@boom.com.mm', '+95912345678', 'https://boom.com.mm', 'No.123, Pyay Road, Yangon', 'Leading electronics retailer in Myanmar', 'active', '660e8400-e29b-41d4-a716-446655440003', '2025-01-01', '2025-12-31', 'Asia/Yangon', 'my', '2025-01-01 10:00:00', '550e8400-e29b-41d4-a716-446655440002'),
('880e8400-e29b-41d4-a716-446655440002', 'FOOD001', 'Golden Spoon Restaurant', 'Food & Beverage', 'Restaurant', 'Ma Khin Khin', 'manager@goldenspoon.mm', '+95987654321', 'https://goldenspoon.mm', 'No.456, Strand Road, Yangon', 'Premium Myanmar cuisine restaurant', 'active', '660e8400-e29b-41d4-a716-446655440002', '2025-02-01', '2026-01-31', 'Asia/Yangon', 'my', '2025-02-01 14:30:00', '550e8400-e29b-41d4-a716-446655440002'),
('880e8400-e29b-41d4-a716-446655440003', 'TECH001', 'Myanmar Tech Solutions', 'Technology', 'Software Development', 'Ko Aung Aung', 'ceo@myanmartech.io', '+95911223344', 'https://myanmartech.io', 'No.789, University Avenue, Yangon', 'Custom software development company', 'pending', '660e8400-e29b-41d4-a716-446655440002', NULL, NULL, 'Asia/Yangon', 'en', NULL, NULL);

-- Insert rate limiting settings for tenants
INSERT INTO tenant_rate_limits (tenant_id, messages_per_minute, api_requests_per_minute, webhook_events_per_minute, throttling_mode, grace_limit_percentage) VALUES
('880e8400-e29b-41d4-a716-446655440001', 120, 200, 100, 'soft_warning', 25),
('880e8400-e29b-41d4-a716-446655440002', 60, 100, 50, 'grace_limit', 20);

-- =============================================
-- TENANT USERS SEED DATA
-- =============================================

-- BOOM Electronics users
INSERT INTO tenant_users (id, tenant_id, full_name, email, normalized_email, password_hash, phone, role, status, department, employee_id) VALUES
('990e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'Mg Thura', 'admin@boom.com.mm', 'admin@boom.com.mm', '$2b$10$rQZ8kqVZ8kqVZ8kqVZ8kqO', '+95912345678', 'admin', 'active', 'Management', 'EMP001'),
('990e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440001', 'Ma Aye Aye', 'supervisor@boom.com.mm', 'supervisor@boom.com.mm', '$2b$10$rQZ8kqVZ8kqVZ8kqVZ8kqO', '+95912345679', 'supervisor', 'active', 'Customer Service', 'EMP002'),
('990e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440001', 'Ko Zaw Zaw', 'csr1@boom.com.mm', 'csr1@boom.com.mm', '$2b$10$rQZ8kqVZ8kqVZ8kqVZ8kqO', '+95912345680', 'csr', 'active', 'Customer Service', 'EMP003'),
('990e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440001', 'Ma Thida', 'csr2@boom.com.mm', 'csr2@boom.com.mm', '$2b$10$rQZ8kqVZ8kqVZ8kqVZ8kqO', '+95912345681', 'csr', 'active', 'Customer Service', 'EMP004'),
('990e8400-e29b-41d4-a716-446655440005', '880e8400-e29b-41d4-a716-446655440001', 'Ko Min Min', 'csr3@boom.com.mm', 'csr3@boom.com.mm', '$2b$10$rQZ8kqVZ8kqVZ8kqVZ8kqO', '+95912345682', 'csr', 'active', 'Technical Support', 'EMP005');

-- Golden Spoon Restaurant users
INSERT INTO tenant_users (id, tenant_id, full_name, email, normalized_email, password_hash, phone, role, status, department, employee_id) VALUES
('990e8400-e29b-41d4-a716-446655440006', '880e8400-e29b-41d4-a716-446655440002', 'Ma Khin Khin', 'manager@goldenspoon.mm', 'manager@goldenspoon.mm', '$2b$10$rQZ8kqVZ8kqVZ8kqVZ8kqO', '+95987654321', 'admin', 'active', 'Management', 'GS001'),
('990e8400-e29b-41d4-a716-446655440007', '880e8400-e29b-41d4-a716-446655440002', 'Ko Kyaw Kyaw', 'waiter1@goldenspoon.mm', 'waiter1@goldenspoon.mm', '$2b$10$rQZ8kqVZ8kqVZ8kqVZ8kqO', '+95987654322', 'csr', 'active', 'Service', 'GS002'),
('990e8400-e29b-41d4-a716-446655440008', '880e8400-e29b-41d4-a716-446655440002', 'Ma Su Su', 'waiter2@goldenspoon.mm', 'waiter2@goldenspoon.mm', '$2b$10$rQZ8kqVZ8kqVZ8kqVZ8kqO', '+95987654323', 'csr', 'active', 'Service', 'GS003');

-- =============================================
-- TENANT CHANNELS SEED DATA
-- =============================================

-- BOOM Electronics channels
INSERT INTO tenant_channels (id, tenant_id, channel_type, channel_name, display_name, status, configuration, welcome_message, auto_reply_enabled, assignment_rule) VALUES
('aa0e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'messenger', 'boom_messenger', 'BOOM Facebook Page', 'active', '{"page_id": "123456789", "app_id": "987654321"}', 'Welcome to BOOM Electronics! How can we help you find the perfect device today?', true, 'round_robin'),
('aa0e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440001', 'viber', 'boom_viber', 'BOOM Viber Business', 'active', '{"account_id": "boom_viber_001"}', 'Hi! Welcome to BOOM Electronics on Viber. What are you looking for?', true, 'least_busy'),
('aa0e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440001', 'telegram', 'boom_telegram', 'BOOM Support Bot', 'active', '{"bot_username": "boom_support_bot"}', 'Hello! I''m the BOOM Electronics support bot. How can I assist you?', false, 'manual');

-- Golden Spoon Restaurant channels
INSERT INTO tenant_channels (id, tenant_id, channel_type, channel_name, display_name, status, configuration, welcome_message, auto_reply_enabled, assignment_rule) VALUES
('aa0e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440002', 'messenger', 'gs_messenger', 'Golden Spoon Restaurant', 'active', '{"page_id": "555666777", "app_id": "111222333"}', 'Welcome to Golden Spoon! Ready to order some delicious Myanmar cuisine?', true, 'round_robin'),
('aa0e8400-e29b-41d4-a716-446655440005', '880e8400-e29b-41d4-a716-446655440002', 'viber', 'gs_viber', 'Golden Spoon Delivery', 'active', '{"account_id": "gs_viber_001"}', 'Mingalaba! Golden Spoon here. What would you like to order today?', true, 'round_robin');

-- =============================================
-- PRODUCT CATEGORIES SEED DATA
-- =============================================

-- BOOM Electronics categories
INSERT INTO product_categories (id, tenant_id, name, description, sort_order) VALUES
('bb0e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'Smartphones', 'Latest smartphones and mobile devices', 1),
('bb0e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440001', 'Laptops', 'Laptops and notebooks for work and gaming', 2),
('bb0e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440001', 'Accessories', 'Phone cases, chargers, and other accessories', 3),
('bb0e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440001', 'Audio', 'Headphones, speakers, and audio equipment', 4);

-- Golden Spoon categories
INSERT INTO product_categories (id, tenant_id, name, description, sort_order) VALUES
('bb0e8400-e29b-41d4-a716-446655440005', '880e8400-e29b-41d4-a716-446655440002', 'Main Dishes', 'Traditional Myanmar main courses', 1),
('bb0e8400-e29b-41d4-a716-446655440006', '880e8400-e29b-41d4-a716-446655440002', 'Appetizers', 'Starters and small plates', 2),
('bb0e8400-e29b-41d4-a716-446655440007', '880e8400-e29b-41d4-a716-446655440002', 'Beverages', 'Drinks and refreshments', 3),
('bb0e8400-e29b-41d4-a716-446655440008', '880e8400-e29b-41d4-a716-446655440002', 'Desserts', 'Sweet treats and desserts', 4);

-- =============================================
-- PRODUCTS SEED DATA
-- =============================================

-- BOOM Electronics products
INSERT INTO products (id, tenant_id, category_id, name, sku, type, description, price, stock_quantity, images, tags, status) VALUES
('cc0e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'bb0e8400-e29b-41d4-a716-446655440001', 'iPhone 15 Pro', 'IP15PRO128', 'product', 'Latest iPhone 15 Pro with 128GB storage', 1850000.00, 25, '["https://example.com/iphone15pro.jpg"]', '["apple", "smartphone", "premium"]', 'active'),
('cc0e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440001', 'bb0e8400-e29b-41d4-a716-446655440001', 'Samsung Galaxy S24', 'SGS24256', 'product', 'Samsung Galaxy S24 with 256GB storage', 1650000.00, 30, '["https://example.com/galaxys24.jpg"]', '["samsung", "android", "flagship"]', 'active'),
('cc0e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440001', 'bb0e8400-e29b-41d4-a716-446655440002', 'MacBook Air M3', 'MBA13M3', 'product', 'MacBook Air 13-inch with M3 chip', 2200000.00, 15, '["https://example.com/macbookair.jpg"]', '["apple", "laptop", "m3"]', 'active'),
('cc0e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440001', 'bb0e8400-e29b-41d4-a716-446655440003', 'iPhone Case Clear', 'IPCASE15', 'product', 'Clear protective case for iPhone 15 series', 25000.00, 100, '["https://example.com/iphonecase.jpg"]', '["case", "protection", "clear"]', 'active'),
('cc0e8400-e29b-41d4-a716-446655440005', '880e8400-e29b-41d4-a716-446655440001', 'bb0e8400-e29b-41d4-a716-446655440004', 'AirPods Pro 2', 'AIRPODS2', 'product', 'Apple AirPods Pro 2nd generation with USB-C', 450000.00, 40, '["https://example.com/airpods.jpg"]', '["apple", "wireless", "earbuds"]', 'active');

-- Golden Spoon products (menu items)
INSERT INTO products (id, tenant_id, category_id, name, sku, type, description, price, stock_quantity, track_inventory, images, tags, status) VALUES
('cc0e8400-e29b-41d4-a716-446655440006', '880e8400-e29b-41d4-a716-446655440002', 'bb0e8400-e29b-41d4-a716-446655440005', 'Mohinga', 'MOHN001', 'product', 'Traditional Myanmar fish noodle soup', 3500.00, 50, false, '["https://example.com/mohinga.jpg"]', '["traditional", "soup", "fish"]', 'active'),
('cc0e8400-e29b-41d4-a716-446655440007', '880e8400-e29b-41d4-a716-446655440002', 'bb0e8400-e29b-41d4-a716-446655440005', 'Shan Noodles', 'SHAN001', 'product', 'Shan style rice noodles with chicken', 4000.00, 30, false, '["https://example.com/shannoodles.jpg"]', '["shan", "noodles", "chicken"]', 'active'),
('cc0e8400-e29b-41d4-a716-446655440008', '880e8400-e29b-41d4-a716-446655440002', 'bb0e8400-e29b-41d4-a716-446655440006', 'Tea Leaf Salad', 'TEAS001', 'product', 'Traditional Myanmar tea leaf salad', 2500.00, 20, false, '["https://example.com/tealeafsalad.jpg"]', '["salad", "traditional", "tea"]', 'active'),
('cc0e8400-e29b-41d4-a716-446655440009', '880e8400-e29b-41d4-a716-446655440002', 'bb0e8400-e29b-41d4-a716-446655440007', 'Myanmar Tea', 'TEA001', 'product', 'Traditional Myanmar milk tea', 1000.00, 100, false, '["https://example.com/myanmartea.jpg"]', '["tea", "milk", "hot"]', 'active'),
('cc0e8400-e29b-41d4-a716-446655440010', '880e8400-e29b-41d4-a716-446655440002', 'bb0e8400-e29b-41d4-a716-446655440008', 'Coconut Rice', 'COCO001', 'product', 'Sweet coconut rice dessert', 1500.00, 25, false, '["https://example.com/coconutrice.jpg"]', '["dessert", "coconut", "sweet"]', 'active');

-- =============================================
-- CANNED RESPONSES SEED DATA
-- =============================================

-- Canned response categories
INSERT INTO canned_response_categories (id, tenant_id, name, description, color, sort_order) VALUES
('dd0e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'Greetings', 'Welcome and greeting messages', '#4CAF50', 1),
('dd0e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440001', 'Product Info', 'Product information and specifications', '#2196F3', 2),
('dd0e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440001', 'Support', 'Technical support responses', '#FF9800', 3),
('dd0e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440002', 'Orders', 'Order-related responses', '#9C27B0', 1),
('dd0e8400-e29b-41d4-a716-446655440005', '880e8400-e29b-41d4-a716-446655440002', 'Menu', 'Menu and food information', '#F44336', 2);

-- BOOM Electronics canned responses
INSERT INTO canned_responses (id, tenant_id, category_id, title, shortcut, content, tags, visibility, created_by) VALUES
('ee0e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'dd0e8400-e29b-41d4-a716-446655440001', 'Welcome Message', '/welcome', 'Hello! Welcome to BOOM Electronics. I''m here to help you find the perfect device. What are you looking for today?', '["greeting", "welcome"]', 'public', '990e8400-e29b-41d4-a716-446655440001'),
('ee0e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440001', 'dd0e8400-e29b-41d4-a716-446655440002', 'iPhone 15 Info', '/iphone15', 'The iPhone 15 Pro features:\n- A17 Pro chip\n- 48MP camera system\n- Titanium design\n- USB-C connectivity\n\nPrice: 1,850,000 MMK\nWould you like to know more?', '["iphone", "specs"]', 'public', '990e8400-e29b-41d4-a716-446655440003'),
('ee0e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440001', 'dd0e8400-e29b-41d4-a716-446655440003', 'Warranty Info', '/warranty', 'All our products come with:\n- 1 year manufacturer warranty\n- 30-day return policy\n- Free technical support\n\nDo you have a specific product in mind?', '["warranty", "support"]', 'public', '990e8400-e29b-41d4-a716-446655440002'),
('ee0e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440001', 'dd0e8400-e29b-41d4-a716-446655440001', 'Thank You', '/thanks', 'Thank you for choosing BOOM Electronics! Is there anything else I can help you with today?', '["thanks", "closing"]', 'public', '990e8400-e29b-41d4-a716-446655440001');

-- Golden Spoon canned responses
INSERT INTO canned_responses (id, tenant_id, category_id, title, shortcut, content, tags, visibility, created_by) VALUES
('ee0e8400-e29b-41d4-a716-446655440005', '880e8400-e29b-41d4-a716-446655440002', 'dd0e8400-e29b-41d4-a716-446655440004', 'Order Greeting', '/order', 'Welcome to Golden Spoon! 🍽️ Ready to order some delicious Myanmar cuisine? Our specialties today are Mohinga and Shan Noodles!', '["greeting", "order"]', 'public', '990e8400-e29b-41d4-a716-446655440006'),
('ee0e8400-e29b-41d4-a716-446655440006', '880e8400-e29b-41d4-a716-446655440002', 'dd0e8400-e29b-41d4-a716-446655440005', 'Menu Info', '/menu', 'Our popular dishes:\n🍜 Mohinga - 3,500 MMK\n🍝 Shan Noodles - 4,000 MMK\n🥗 Tea Leaf Salad - 2,500 MMK\n🍵 Myanmar Tea - 1,000 MMK\n\nWhat would you like to try?', '["menu", "prices"]', 'public', '990e8400-e29b-41d4-a716-446655440007'),
('ee0e8400-e29b-41d4-a716-446655440007', '880e8400-e29b-41d4-a716-446655440002', 'dd0e8400-e29b-41d4-a716-446655440004', 'Delivery Info', '/delivery', 'We deliver within Yangon:\n- Delivery fee: 1,500 MMK\n- Delivery time: 30-45 minutes\n- Minimum order: 5,000 MMK\n\nWhat''s your delivery address?', '["delivery", "info"]', 'public', '990e8400-e29b-41d4-a716-446655440006');

-- =============================================
-- SAMPLE CUSTOMERS SEED DATA
-- =============================================

-- BOOM Electronics customers
INSERT INTO customers (id, tenant_id, external_id, channel_id, full_name, email, phone, language, first_contact_at, last_contact_at, total_conversations) VALUES
('ff0e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'fb_user_123456', 'aa0e8400-e29b-41d4-a716-446655440001', 'Ko Thant Zin', 'thantzin@email.com', '+95911111111', 'my', '2025-08-01 09:00:00', '2025-08-07 15:30:00', 3),
('ff0e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440001', 'viber_user_789012', 'aa0e8400-e29b-41d4-a716-446655440002', 'Ma Hnin Hnin', 'hninhnin@email.com', '+95922222222', 'my', '2025-08-02 10:15:00', '2025-08-06 14:20:00', 2),
('ff0e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440001', 'tg_user_345678', 'aa0e8400-e29b-41d4-a716-446655440003', 'Ko Aung Myat', 'aungmyat@email.com', '+95933333333', 'en', '2025-08-03 11:30:00', '2025-08-08 09:45:00', 1);

-- Golden Spoon customers
INSERT INTO customers (id, tenant_id, external_id, channel_id, full_name, email, phone, language, first_contact_at, last_contact_at, total_conversations) VALUES
('ff0e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440002', 'fb_user_555666', 'aa0e8400-e29b-41d4-a716-446655440004', 'Ma Thiri', 'thiri@email.com', '+95944444444', 'my', '2025-08-04 12:00:00', '2025-08-08 18:30:00', 4),
('ff0e8400-e29b-41d4-a716-446655440005', '880e8400-e29b-41d4-a716-446655440002', 'viber_user_777888', 'aa0e8400-e29b-41d4-a716-446655440005', 'Ko Zaw Min', 'zawmin@email.com', '+95955555555', 'my', '2025-08-05 13:15:00', '2025-08-07 19:45:00', 2);

-- =============================================
-- SAMPLE CONVERSATIONS SEED DATA
-- =============================================

-- BOOM Electronics conversations
INSERT INTO conversations (id, tenant_id, customer_id, channel_id, assigned_csr_id, subject, status, priority, first_message_at, last_message_at) VALUES
('110e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'ff0e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440001', '990e8400-e29b-41d4-a716-446655440003', 'iPhone 15 Pro Inquiry', 'resolved', 'normal', 'normal', '2025-08-07 09:00:00', '2025-08-07 15:30:00'),
('110e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440001', 'ff0e8400-e29b-41d4-a716-446655440002', 'aa0e8400-e29b-41d4-a716-446655440002', '990e8400-e29b-41d4-a716-446655440004', 'MacBook Air Question', 'open', 'normal', 'normal', '2025-08-08 10:15:00', '2025-08-08 14:20:00'),
('110e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440001', 'ff0e8400-e29b-41d4-a716-446655440003', 'aa0e8400-e29b-41d4-a716-446655440003', '990e8400-e29b-41d4-a716-446655440005', 'Technical Support', 'pending', 'high', 'high', '2025-08-08 11:30:00', '2025-08-08 09:45:00');

-- Golden Spoon conversations
INSERT INTO conversations (id, tenant_id, customer_id, channel_id, assigned_csr_id, subject, status, priority, first_message_at, last_message_at) VALUES
('110e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440002', 'ff0e8400-e29b-41d4-a716-446655440004', 'aa0e8400-e29b-41d4-a716-446655440004', '990e8400-e29b-41d4-a716-446655440007', 'Lunch Order', 'resolved', 'normal', 'normal', '2025-08-08 12:00:00', '2025-08-08 18:30:00'),
('110e8400-e29b-41d4-a716-446655440005', '880e8400-e29b-41d4-a716-446655440002', 'ff0e8400-e29b-41d4-a716-446655440005', 'aa0e8400-e29b-41d4-a716-446655440005', '990e8400-e29b-41d4-a716-446655440008', 'Dinner Reservation', 'open', 'normal', 'normal', '2025-08-08 13:15:00', '2025-08-08 19:45:00');

-- =============================================
-- SAMPLE MESSAGES SEED DATA
-- =============================================

-- Messages for BOOM Electronics conversation
INSERT INTO messages (id, conversation_id, tenant_id, sender_type, sender_id, message_type, content, status, created_at) VALUES
('220e8400-e29b-41d4-a716-446655440001', '110e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'customer', 'ff0e8400-e29b-41d4-a716-446655440001', 'text', 'Hi, I''m interested in the iPhone 15 Pro. Can you tell me more about it?', 'read', '2025-08-07 09:00:00'),
('220e8400-e29b-41d4-a716-446655440002', '110e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'csr', '990e8400-e29b-41d4-a716-446655440003', 'text', 'Hello! The iPhone 15 Pro features the A17 Pro chip, 48MP camera system, and titanium design. It''s priced at 1,850,000 MMK. Would you like to know more about any specific features?', 'read', '2025-08-07 09:05:00'),
('220e8400-e29b-41d4-a716-446655440003', '110e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'customer', 'ff0e8400-e29b-41d4-a716-446655440001', 'text', 'What about the camera? I take a lot of photos.', 'read', '2025-08-07 09:10:00'),
('220e8400-e29b-41d4-a716-446655440004', '110e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'csr', '990e8400-e29b-41d4-a716-446655440003', 'text', 'The camera is excellent! It has a 48MP main camera with 2x telephoto zoom, plus improved Night mode and Portrait photography. Perfect for photography enthusiasts!', 'read', 'read', '2025-08-07 15:30:00');

-- Messages for Golden Spoon conversation
INSERT INTO messages (id, conversation_id, tenant_id, sender_type, sender_id, message_type, content, status, created_at) VALUES
('220e8400-e29b-41d4-a716-446655440005', '110e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440002', 'customer', 'ff0e8400-e29b-41d4-a716-446655440004', 'text', 'Hello! I''d like to order lunch for delivery.', 'read', '2025-08-08 12:00:00'),
('220e8400-e29b-41d4-a716-446655440006', '110e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440002', 'csr', '990e8400-e29b-41d4-a716-446655440007', 'text', 'Welcome to Golden Spoon! 🍽️ What would you like to order today? Our specialties are Mohinga (3,500 MMK) and Shan Noodles (4,000 MMK).', 'read', 'read', '2025-08-08 12:02:00'),
('220e8400-e29b-41d4-a716-446655440007', '110e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440002', 'customer', 'ff0e8400-e29b-41d4-a716-446655440004', 'text', 'I''ll take 2 Mohinga and 1 Myanmar Tea please.', 'read', '2025-08-08 12:05:00');

-- =============================================
-- SAMPLE ORDERS SEED DATA
-- =============================================

-- Golden Spoon order
INSERT INTO orders (id, tenant_id, customer_id, conversation_id, order_number, status, payment_status, payment_method, subtotal, tax_amount, shipping_fee, total_amount, currency, created_by, created_at) VALUES
('330e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440002', 'ff0e8400-e29b-41d4-a716-446655440004', '110e8400-e29b-41d4-a716-446655440004', 'GS-20250808-001', 'delivered', 'paid', 'cod', 8000.00, 0.00, 1500.00, 9500.00, 'MMK', '990e8400-e29b-41d4-a716-446655440007', '2025-08-08 12:10:00');

-- Order items for Golden Spoon order
INSERT INTO order_items (id, order_id, product_id, product_name, product_sku, quantity, unit_price, total_price) VALUES
('440e8400-e29b-41d4-a716-446655440001', '330e8400-e29b-41d4-a716-446655440001', 'cc0e8400-e29b-41d4-a716-446655440006', 'Mohinga', 'MOHN001', 2, 3500.00, 7000.00),
('440e8400-e29b-41d4-a716-446655440002', '330e8400-e29b-41d4-a716-446655440001', 'cc0e8400-e29b-41d4-a716-446655440009', 'Myanmar Tea', 'TEA001', 1, 1000.00, 1000.00);

-- =============================================
-- TENANT SETTINGS SEED DATA
-- =============================================

-- BOOM Electronics settings
INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, setting_type, description, is_public) VALUES
('880e8400-e29b-41d4-a716-446655440001', 'business_hours', '{"monday": {"open": "09:00", "close": "18:00"}, "tuesday": {"open": "09:00", "close": "18:00"}, "wednesday": {"open": "09:00", "close": "18:00"}, "thursday": {"open": "09:00", "close": "18:00"}, "friday": {"open": "09:00", "close": "18:00"}, "saturday": {"open": "09:00", "close": "17:00"}, "sunday": {"closed": true}}', 'json', 'Business operating hours', true),
('880e8400-e29b-41d4-a716-446655440001', 'auto_assignment', 'true', 'boolean', 'Enable automatic conversation assignment', false),
('880e8400-e29b-41d4-a716-446655440001', 'welcome_message', 'Welcome to BOOM Electronics! How can we help you today?', 'string', 'Default welcome message', true);

-- Golden Spoon settings
INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, setting_type, description, is_public) VALUES
('880e8400-e29b-41d4-a716-446655440002', 'business_hours', '{"monday": {"open": "10:00", "close": "22:00"}, "tuesday": {"open": "10:00", "close": "22:00"}, "wednesday": {"open": "10:00", "close": "22:00"}, "thursday": {"open": "10:00", "close": "22:00"}, "friday": {"open": "10:00", "close": "23:00"}, "saturday": {"open": "10:00", "close": "23:00"}, "sunday": {"open": "10:00", "close": "22:00"}}', 'json', 'Restaurant operating hours', true),
('880e8400-e29b-41d4-a716-446655440002', 'delivery_fee', '1500', 'number', 'Standard delivery fee in MMK', true),
('880e8400-e29b-41d4-a716-446655440002', 'minimum_order', '5000', 'number', 'Minimum order amount for delivery in MMK', true);

-- =============================================
-- PLATFORM SETTINGS SEED DATA
-- =============================================

INSERT INTO platform_settings (setting_key, setting_value, setting_type, description, is_public) VALUES
('platform_name', '"KME ZayOS Platform"', 'string', 'Platform display name', true),
('default_timezone', '"Asia/Yangon"', 'string', 'Default timezone for new tenants', false),
('max_file_size_mb', '50', 'number', 'Maximum file upload size in MB', false),
('session_timeout_minutes', '480', 'number', 'User session timeout in minutes', false),
('maintenance_mode', 'false', 'boolean', 'Platform maintenance mode', true);

-- =============================================
-- SAMPLE ANALYTICS DATA
-- =============================================

-- Tenant analytics for the past week
INSERT INTO tenant_analytics (tenant_id, date, total_conversations, new_conversations, resolved_conversations, total_messages, avg_response_time_seconds, active_csrs) VALUES
('880e8400-e29b-41d4-a716-446655440001', '2025-08-01', 5, 3, 2, 25, 180, 3),
('880e8400-e29b-41d4-a716-446655440001', '2025-08-02', 8, 5, 4, 40, 150, 3),
('880e8400-e29b-41d4-a716-446655440001', '2025-08-03', 6, 4, 3, 30, 200, 2),
('880e8400-e29b-41d4-a716-446655440001', '2025-08-04', 7, 3, 5, 35, 120, 3),
('880e8400-e29b-41d4-a716-446655440001', '2025-08-05', 9, 6, 4, 45, 160, 3),
('880e8400-e29b-41d4-a716-446655440002', '2025-08-01', 12, 8, 7, 60, 90, 2),
('880e8400-e29b-41d4-a716-446655440002', '2025-08-02', 15, 10, 9, 75, 85, 2),
('880e8400-e29b-41d4-a716-446655440002', '2025-08-03', 18, 12, 11, 90, 95, 2),
('880e8400-e29b-41d4-a716-446655440002', '2025-08-04', 14, 9, 8, 70, 100, 2),
('880e8400-e29b-41d4-a716-446655440002', '2025-08-05', 16, 11, 10, 80, 88, 2);

-- CSR analytics
INSERT INTO csr_analytics (tenant_id, csr_id, date, conversations_handled, messages_sent, avg_response_time_seconds, online_time_minutes) VALUES
('880e8400-e29b-41d4-a716-446655440001', '990e8400-e29b-41d4-a716-446655440003', '2025-08-08', 3, 15, 120, 480),
('880e8400-e29b-41d4-a716-446655440001', '990e8400-e29b-41d4-a716-446655440004', '2025-08-08', 2, 12, 150, 480),
('880e8400-e29b-41d4-a716-446655440001', '990e8400-e29b-41d4-a716-446655440005', '2025-08-08', 1, 8, 200, 240),
('880e8400-e29b-41d4-a716-446655440002', '990e8400-e29b-41d4-a716-446655440007', '2025-08-08', 8, 40, 85, 480),
('880e8400-e29b-41d4-a716-446655440002', '990e8400-e29b-41d4-a716-446655440008', '2025-08-08', 6, 30, 95, 480);

-- Channel analytics
INSERT INTO channel_analytics (tenant_id, channel_id, date, messages_received, messages_sent, conversations_started, conversations_resolved, avg_response_time_seconds) VALUES
('880e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440001', '2025-08-08', 15, 18, 3, 2, 120),
('880e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440002', '2025-08-08', 12, 15, 2, 1, 150),
('880e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440003', '2025-08-08', 8, 10, 1, 0, 200),
('880e8400-e29b-41d4-a716-446655440002', 'aa0e8400-e29b-41d4-a716-446655440004', '2025-08-08', 35, 40, 8, 6, 85),
('880e8400-e29b-41d4-a716-446655440002', 'aa0e8400-e29b-41d4-a716-446655440005', '2025-08-08', 25, 30, 6, 4, 95);
