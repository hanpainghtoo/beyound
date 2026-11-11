\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  suffix text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  tenant_id uuid := uuid_generate_v4();
  channel_id uuid := uuid_generate_v4();
  pending_customer_id uuid := uuid_generate_v4();
  rejected_customer_id uuid := uuid_generate_v4();
  product_id uuid := uuid_generate_v4();
  service_product_id uuid := uuid_generate_v4();
  pending_order_id uuid := uuid_generate_v4();
  rejected_order_id uuid := uuid_generate_v4();
  delivered_order_id uuid := uuid_generate_v4();
  failed_order_id uuid := uuid_generate_v4();
  returned_order_id uuid := uuid_generate_v4();
  pending_item_id uuid := uuid_generate_v4();
  rejected_item_id uuid := uuid_generate_v4();
  delivered_item_id uuid := uuid_generate_v4();
  failed_item_id uuid := uuid_generate_v4();
  returned_item_id uuid := uuid_generate_v4();
BEGIN
  INSERT INTO tenants (id, tenant_code, company_name, contact_email, status, language, order_settings, order_expiry_settings)
  VALUES (tenant_id, 'commerce-fixture-' || suffix, 'Commerce simplification fixtures', 'fixtures-' || suffix || '@example.test', 'active', 'en', '{}', '{"pendingPayment":2,"rejected":12,"rejectedRetryMax":3}');
  INSERT INTO tenant_channels (id, tenant_id, channel_type, channel_name, status, configuration)
  VALUES (channel_id, tenant_id, 'telegram', 'Fixture Telegram', 'active', '{"telegramShopping":{"shopEnabled":true,"orderingEnabled":true}}');
  INSERT INTO customers (id, tenant_id, channel_id, external_id, provider, full_name, phone)
  VALUES
    (pending_customer_id, tenant_id, channel_id, 'fixture-pending-' || suffix, 'telegram', 'Pending Bot Customer', '+959400000001'),
    (rejected_customer_id, tenant_id, channel_id, 'fixture-rejected-' || suffix, 'telegram', 'Rejected Bot Customer', '+959400000002');
  INSERT INTO products (id, tenant_id, name, sku, price, stock_quantity, track_inventory, status)
  VALUES
    (product_id, tenant_id, 'Fixture tracked product', 'FIX-TRACK-' || suffix, 10000, 8, true, 'active'),
    (service_product_id, tenant_id, 'Fixture service product', 'FIX-SERVICE-' || suffix, 5000, 0, false, 'active');

  INSERT INTO orders (id, tenant_id, customer_id, order_number, status, delivery_status, payment_status, payment_method, subtotal, total_amount, paid_amount, currency, shipping_address, payment_submitted_at, expires_at, attachments, status_history)
  VALUES
    (pending_order_id, tenant_id, pending_customer_id, 'FIX-' || suffix || '-P', 'pending', 'packed', 'unpaid', 'online', 10000, 10000, 0, 'MMK', 'No.528, Room B, Igin Street, Yangon City', now(), now() + interval '2 hours', jsonb_build_array(jsonb_build_object('fileId','fixture-storage-proof-' || suffix,'role','payment_proof','contentType','image/jpeg','metadata',jsonb_build_object('telegramFileId','fixture-telegram-proof-' || suffix))), jsonb_build_array(jsonb_build_object('field','order','status','pending','previousStatus',null,'actorType','customer','source','telegram'))),
    (rejected_order_id, tenant_id, rejected_customer_id, 'FIX-' || suffix || '-R', 'rejected', 'packed', 'unpaid', 'online', 10000, 10000, 0, 'MMK', 'No.528, Room B, Igin Street, Yangon City', null, now() + interval '12 hours', '[]', jsonb_build_array(jsonb_build_object('field','order','status','rejected','previousStatus','pending','actorType','tenant_user','source','agent','reason','payment proof is wrong'))),
    (delivered_order_id, tenant_id, pending_customer_id, 'FIX-' || suffix || '-D', 'confirmed', 'delivered', 'paid', 'online', 10000, 10000, 10000, 'MMK', 'Yangon', null, null, '[]', jsonb_build_array(jsonb_build_object('field','delivery','status','delivered','previousStatus','out_for_delivery','actorType','tenant_user','reason',null))),
    (failed_order_id, tenant_id, rejected_customer_id, 'FIX-' || suffix || '-F', 'confirmed', 'failed_delivery', 'unpaid', 'bank_transfer', 10000, 10000, 0, 'MMK', 'Yangon', null, null, '[]', jsonb_build_array(jsonb_build_object('field','delivery','status','failed_delivery','previousStatus','out_for_delivery','actorType','tenant_user','reason','customer unavailable'))),
    (returned_order_id, tenant_id, pending_customer_id, 'FIX-' || suffix || '-T', 'confirmed', 'returned', 'paid', 'online', 10000, 10000, 10000, 'MMK', 'Yangon', null, null, '[]', jsonb_build_array(jsonb_build_object('field','delivery','status','returned','previousStatus','delivered','actorType','tenant_user','reason','customer refused')));

  INSERT INTO order_items (id, order_id, product_id, product_name, product_sku, product_snapshot, variation_snapshot, quantity, unit_price, total_price)
  VALUES
    (pending_item_id, pending_order_id, product_id, 'Fixture tracked product', 'FIX-TRACK-' || suffix, '{}', '{}', 1, 10000, 10000),
    (rejected_item_id, rejected_order_id, product_id, 'Fixture tracked product', 'FIX-TRACK-' || suffix, '{}', '{}', 1, 10000, 10000),
    (delivered_item_id, delivered_order_id, product_id, 'Fixture tracked product', 'FIX-TRACK-' || suffix, '{}', '{}', 1, 10000, 10000),
    (failed_item_id, failed_order_id, service_product_id, 'Fixture service product', 'FIX-SERVICE-' || suffix, '{}', '{}', 1, 5000, 5000),
    (returned_item_id, returned_order_id, product_id, 'Fixture tracked product', 'FIX-TRACK-' || suffix, '{}', '{}', 1, 10000, 10000);
  INSERT INTO order_item_reservations (tenant_id, order_id, order_item_id, product_id, quantity, state)
  VALUES (tenant_id, pending_order_id, pending_item_id, product_id, 1, 'active');
  UPDATE orders SET delivery_assignee_name = 'Fixture Driver', delivery_assignee_phone = '+959499999999', delivery_date = current_date WHERE id IN (delivered_order_id, failed_order_id);
  RAISE NOTICE 'Loaded commerce simplification fixtures for tenant code commerce-fixture-%', suffix;
END $$;
COMMIT;
