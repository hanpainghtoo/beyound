import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialCommerceOsSchema1781803237583 implements MigrationInterface {
  name = 'InitialCommerceOsSchema1781803237583';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "platform_admins" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "full_name" character varying NOT NULL, "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "role" character varying NOT NULL DEFAULT 'ops_admin', "status" character varying NOT NULL DEFAULT 'active', "two_factor_enabled" boolean NOT NULL DEFAULT false, "last_login_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_7ddfa7abfaf477f671ccc566c83" UNIQUE ("email"), CONSTRAINT "PK_faecb3398d1962507b44c76e4f0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tenant_users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" character varying NOT NULL, "full_name" character varying NOT NULL, "first_name" character varying NOT NULL, "last_name" character varying NOT NULL, "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "phone" character varying, "role" character varying NOT NULL DEFAULT 'csr', "status" character varying NOT NULL DEFAULT 'active', "is_online" boolean NOT NULL DEFAULT false, "last_seen_at" TIMESTAMP, "avatar_url" character varying, "department" character varying, "employee_id" character varying, "hire_date" TIMESTAMP, "permissions" jsonb NOT NULL DEFAULT '{}', "notification_preferences" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8ce1bc9e3a5887c234900365447" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tenants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_code" character varying NOT NULL, "company_name" character varying NOT NULL, "industry" character varying, "business_type" character varying, "contact_person" character varying, "contact_email" character varying NOT NULL, "contact_phone" character varying, "website" character varying, "address" text, "logo_url" character varying, "description" text, "status" character varying NOT NULL DEFAULT 'pending', "subscription_plan_id" character varying, "subscription_start_date" date, "subscription_end_date" date, "custom_csr_limit" integer, "custom_channel_limit" integer, "custom_message_limit" integer, "timezone" character varying NOT NULL DEFAULT 'Asia/Yangon', "language" character varying NOT NULL DEFAULT 'en', "feature_flags" jsonb NOT NULL DEFAULT '{}', "ai_settings" jsonb NOT NULL DEFAULT '{"enabled":false}', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "approved_at" TIMESTAMP, "approved_by" uuid, CONSTRAINT "UQ_c363668203c5dc09ce433fc7b55" UNIQUE ("tenant_code"), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "subscription_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" text, "monthly_price" numeric(10,2) NOT NULL DEFAULT '0', "max_csrs" integer NOT NULL DEFAULT '5', "max_channels" integer NOT NULL DEFAULT '3', "message_limit" integer NOT NULL DEFAULT '1000', "api_limit" integer NOT NULL DEFAULT '5000', "storage_limit_gb" integer NOT NULL DEFAULT '1', "features" jsonb NOT NULL DEFAULT '{}', "status" character varying NOT NULL DEFAULT 'active', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9ab8fe6918451ab3d0a4fb6bb0c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tenant_rate_limits" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "messages_per_minute" integer NOT NULL DEFAULT '60', "api_requests_per_minute" integer NOT NULL DEFAULT '100', "webhook_events_per_minute" integer NOT NULL DEFAULT '50', "throttling_mode" character varying NOT NULL DEFAULT 'soft_warning', "grace_limit_percentage" integer NOT NULL DEFAULT '20', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6e2f9a49374e47246113f0877a3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "channel_templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channel_type" character varying NOT NULL, "template_name" character varying NOT NULL, "app_id" character varying, "bot_token" character varying, "callback_url" character varying, "webhook_events" jsonb NOT NULL DEFAULT '[]', "default_welcome_message" text, "status" character varying NOT NULL DEFAULT 'active', "configuration" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_af98bc7ae5176603161cafd8f98" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tenant_channels" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "channel_type" character varying NOT NULL, "channel_name" character varying NOT NULL, "display_name" character varying, "status" character varying NOT NULL DEFAULT 'active', "configuration" jsonb NOT NULL DEFAULT '{}', "credentials" jsonb NOT NULL DEFAULT '{}', "credential_schema" jsonb NOT NULL DEFAULT '[]', "credential_status" character varying NOT NULL DEFAULT 'missing_required', "connection_status" character varying NOT NULL DEFAULT 'pending_configuration', "connected_at" TIMESTAMP, "credential_last_updated_at" TIMESTAMP, "last_connection_test_at" TIMESTAMP, "rate_limit_metadata" jsonb NOT NULL DEFAULT '{}', "webhook_url" character varying, "welcome_message" text, "auto_reply_enabled" boolean NOT NULL DEFAULT false, "auto_reply_message" text, "assignment_rule" character varying NOT NULL DEFAULT 'round_robin', "business_hours" jsonb NOT NULL DEFAULT '{}', "notification_settings" jsonb NOT NULL DEFAULT '{}', "last_sync_at" TIMESTAMP, "error_message" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e9f401540c15e47177fb0f514cd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "customers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "external_id" character varying, "channel_id" uuid NOT NULL, "full_name" character varying, "email" character varying, "phone" character varying, "avatar_url" character varying, "language" character varying NOT NULL DEFAULT 'en', "timezone" character varying, "location" jsonb, "profile_data" jsonb NOT NULL DEFAULT '{}', "tags" jsonb NOT NULL DEFAULT '[]', "notes" text, "status" character varying NOT NULL DEFAULT 'active', "first_contact_at" TIMESTAMP, "last_contact_at" TIMESTAMP, "total_conversations" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "customer_id" uuid NOT NULL, "channel_id" uuid NOT NULL, "assigned_csr_id" uuid, "assigned_at" TIMESTAMP, "conversation_id" character varying, "subject" character varying, "status" character varying NOT NULL DEFAULT 'open', "priority" character varying NOT NULL DEFAULT 'normal', "tags" jsonb NOT NULL DEFAULT '[]', "metadata" jsonb NOT NULL DEFAULT '{}', "first_message_at" TIMESTAMP, "last_message_at" TIMESTAMP, "last_customer_message_at" TIMESTAMP, "last_csr_response_at" TIMESTAMP, "first_response_at" TIMESTAMP, "sla_due_at" TIMESTAMP, "closed_at" TIMESTAMP, "close_reason" character varying, "resolved_at" TIMESTAMP, "resolution_time_seconds" integer, "customer_satisfaction_rating" integer, "customer_feedback" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "tenant_id" uuid NOT NULL, "sender_type" character varying NOT NULL, "sender_id" character varying, "message_type" character varying NOT NULL DEFAULT 'text', "content" text, "attachments" jsonb NOT NULL DEFAULT '[]', "metadata" jsonb NOT NULL DEFAULT '{}', "external_message_id" character varying, "reply_to_message_id" uuid, "status" character varying NOT NULL DEFAULT 'sent', "is_internal" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "name" character varying NOT NULL, "description" text, "parent_category_id" uuid, "sort_order" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7069dac60d88408eca56fdc9e0c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "category_id" uuid, "name" character varying NOT NULL, "sku" character varying, "type" character varying NOT NULL DEFAULT 'product', "description" text, "short_description" text, "price" numeric(10,2) NOT NULL DEFAULT '0', "cost_price" numeric(10,2), "stock_quantity" integer NOT NULL DEFAULT '0', "low_stock_threshold" integer NOT NULL DEFAULT '5', "track_inventory" boolean NOT NULL DEFAULT true, "weight" numeric(8,2), "dimensions" jsonb, "images" jsonb NOT NULL DEFAULT '[]', "tags" jsonb NOT NULL DEFAULT '[]', "status" character varying NOT NULL DEFAULT 'active', "is_featured" boolean NOT NULL DEFAULT false, "seo_title" character varying, "seo_description" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "customer_id" uuid, "conversation_id" uuid, "order_number" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'new', "payment_status" character varying NOT NULL DEFAULT 'pending', "payment_method" character varying, "subtotal" numeric(10,2) NOT NULL DEFAULT '0', "tax_amount" numeric(10,2) NOT NULL DEFAULT '0', "discount_amount" numeric(10,2) NOT NULL DEFAULT '0', "shipping_fee" numeric(10,2) NOT NULL DEFAULT '0', "total_amount" numeric(10,2) NOT NULL DEFAULT '0', "paid_amount" numeric(10,2) NOT NULL DEFAULT '0', "balance_due" numeric(10,2) NOT NULL DEFAULT '0', "currency" character varying NOT NULL DEFAULT 'MMK', "notes" text, "shipping_address" jsonb, "billing_address" jsonb, "delivery_date" date, "tracking_number" character varying, "delivery_assignee_name" character varying, "delivery_assignee_phone" character varying, "delivery_zone" character varying, "cod_amount" numeric(10,2) NOT NULL DEFAULT '0', "cod_collected_at" TIMESTAMP, "payment_notes" text, "status_history" jsonb NOT NULL DEFAULT '[]', "created_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "product_id" uuid, "product_name" character varying NOT NULL, "product_sku" character varying, "product_snapshot" jsonb NOT NULL DEFAULT '{}', "variation_snapshot" jsonb NOT NULL DEFAULT '{}', "quantity" integer NOT NULL DEFAULT '1', "unit_price" numeric(10,2) NOT NULL, "total_price" numeric(10,2) NOT NULL, "notes" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "canned_responses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "category_id" character varying, "title" character varying NOT NULL, "shortcut" character varying, "content" text NOT NULL, "tags" jsonb NOT NULL DEFAULT '[]', "visibility" character varying NOT NULL DEFAULT 'public', "created_by" uuid, "usage_count" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1df87c74d99c463b1c7fb30dc14" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tenant_analytics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "date" date NOT NULL, "total_conversations" integer NOT NULL DEFAULT '0', "new_conversations" integer NOT NULL DEFAULT '0', "resolved_conversations" integer NOT NULL DEFAULT '0', "total_messages" integer NOT NULL DEFAULT '0', "avg_response_time_seconds" integer NOT NULL DEFAULT '0', "avg_resolution_time_seconds" integer NOT NULL DEFAULT '0', "active_csrs" integer NOT NULL DEFAULT '0', "customer_satisfaction_avg" numeric(3,2), "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_572000616a480aeab9947a5fda4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "csr_analytics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "csr_id" uuid NOT NULL, "date" date NOT NULL, "conversations_handled" integer NOT NULL DEFAULT '0', "messages_sent" integer NOT NULL DEFAULT '0', "avg_response_time_seconds" integer NOT NULL DEFAULT '0', "avg_resolution_time_seconds" integer NOT NULL DEFAULT '0', "customer_satisfaction_avg" numeric(3,2), "online_time_minutes" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f0a3a5295c185badfe35faf0019" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "user_id" uuid NOT NULL, "type" character varying NOT NULL, "title" character varying NOT NULL, "message" text NOT NULL, "action_url" character varying, "is_read" boolean NOT NULL DEFAULT false, "expires_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "platform_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying NOT NULL, "value" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_5d9031e30fac3ec3ec8b9602e17" UNIQUE ("key"), CONSTRAINT "PK_2934aeb70ec285196dcab4a2e96" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "domain_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" character varying NOT NULL, "actor_id" character varying, "actor_type" character varying, "entity_type" character varying NOT NULL, "entity_id" character varying NOT NULL, "event_type" character varying NOT NULL, "payload" jsonb NOT NULL DEFAULT '{}', "source" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_66e0920a32dda3a89b46ee7a981" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "platform_audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "admin_id" uuid, "action" character varying(100) NOT NULL, "resource_type" character varying(50), "resource_id" uuid, "old_values" jsonb, "new_values" jsonb, "ip_address" inet, "user_agent" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_df9143ce2f97b20833a989e1e8c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tenant_audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "user_id" uuid, "action" character varying(100) NOT NULL, "resource_type" character varying(50), "resource_id" uuid, "old_values" jsonb, "new_values" jsonb, "ip_address" inet, "user_agent" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_85679855aa309f585e51c7b8b88" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD CONSTRAINT "FK_f2374c524449ea4ed657d596115" FOREIGN KEY ("approved_by") REFERENCES "platform_admins"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_rate_limits" ADD CONSTRAINT "FK_1774c456fb1732f98fcee7d49c8" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" ADD CONSTRAINT "FK_9aa58e840967b49744905b5738e" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD CONSTRAINT "FK_97913f35ac2e435a4463fb50a01" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD CONSTRAINT "FK_513b68b9a1bdf27e87d5ad051a2" FOREIGN KEY ("channel_id") REFERENCES "tenant_channels"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "FK_664e8d7cbdae35df5cae341352a" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "FK_c9f0434c15cacf894e996f69088" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "FK_1a99838ee2e2e940ad98ed2e9d8" FOREIGN KEY ("channel_id") REFERENCES "tenant_channels"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD CONSTRAINT "FK_d86b9fd57d1fc4d1699141f1401" FOREIGN KEY ("assigned_csr_id") REFERENCES "tenant_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "FK_558150f45586066db2415eb28c5" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "FK_7f87cbb925b1267778a7f4c5d67" FOREIGN KEY ("reply_to_message_id") REFERENCES "messages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" ADD CONSTRAINT "FK_ae01c94ee4f9e9383672db7d56b" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" ADD CONSTRAINT "FK_f0104fa49fb1974840ee758db8f" FOREIGN KEY ("parent_category_id") REFERENCES "product_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_9c365ebf78f0e8a6d9e4827ea70" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_9a5f6868c96e0069e699f33e124" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_527dd6efd5f3402f729c6b3e826" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_d58acb99141f77ad3b1bddfe9e3" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_574a2f0932043d4e4baf188ee05" FOREIGN KEY ("created_by") REFERENCES "tenant_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_9263386c35b6b242540f9493b00" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "canned_responses" ADD CONSTRAINT "FK_1ba2925b82a7f996a23ef5dfba9" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "canned_responses" ADD CONSTRAINT "FK_3e9a18ccdb5f4a32d9214904f15" FOREIGN KEY ("created_by") REFERENCES "tenant_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_analytics" ADD CONSTRAINT "FK_5fbf53bcde9a9f71dc45c041e9b" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "csr_analytics" ADD CONSTRAINT "FK_c5a7f445076f4e441dd022deb3a" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "csr_analytics" ADD CONSTRAINT "FK_9ac883bd6be4856f7075bfe8cdf" FOREIGN KEY ("csr_id") REFERENCES "tenant_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_d93ddd7e1b890535ecafbb334ec" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "tenant_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "FK_84cdaeb2a814950c4911b39b056" FOREIGN KEY ("admin_id") REFERENCES "platform_admins"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_audit_logs" ADD CONSTRAINT "FK_a970d53c51a7153651095dda00a" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_audit_logs" ADD CONSTRAINT "FK_7c867e7bd0a7995969e6740311e" FOREIGN KEY ("user_id") REFERENCES "tenant_users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_audit_logs" DROP CONSTRAINT "FK_7c867e7bd0a7995969e6740311e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_audit_logs" DROP CONSTRAINT "FK_a970d53c51a7153651095dda00a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "platform_audit_logs" DROP CONSTRAINT "FK_84cdaeb2a814950c4911b39b056"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_d93ddd7e1b890535ecafbb334ec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "csr_analytics" DROP CONSTRAINT "FK_9ac883bd6be4856f7075bfe8cdf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "csr_analytics" DROP CONSTRAINT "FK_c5a7f445076f4e441dd022deb3a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_analytics" DROP CONSTRAINT "FK_5fbf53bcde9a9f71dc45c041e9b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "canned_responses" DROP CONSTRAINT "FK_3e9a18ccdb5f4a32d9214904f15"`,
    );
    await queryRunner.query(
      `ALTER TABLE "canned_responses" DROP CONSTRAINT "FK_1ba2925b82a7f996a23ef5dfba9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_9263386c35b6b242540f9493b00"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_574a2f0932043d4e4baf188ee05"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_d58acb99141f77ad3b1bddfe9e3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_527dd6efd5f3402f729c6b3e826"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_9a5f6868c96e0069e699f33e124"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_9c365ebf78f0e8a6d9e4827ea70"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" DROP CONSTRAINT "FK_f0104fa49fb1974840ee758db8f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" DROP CONSTRAINT "FK_ae01c94ee4f9e9383672db7d56b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" DROP CONSTRAINT "FK_7f87cbb925b1267778a7f4c5d67"`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" DROP CONSTRAINT "FK_558150f45586066db2415eb28c5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" DROP CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" DROP CONSTRAINT "FK_d86b9fd57d1fc4d1699141f1401"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" DROP CONSTRAINT "FK_1a99838ee2e2e940ad98ed2e9d8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" DROP CONSTRAINT "FK_c9f0434c15cacf894e996f69088"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" DROP CONSTRAINT "FK_664e8d7cbdae35df5cae341352a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" DROP CONSTRAINT "FK_513b68b9a1bdf27e87d5ad051a2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" DROP CONSTRAINT "FK_97913f35ac2e435a4463fb50a01"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_channels" DROP CONSTRAINT "FK_9aa58e840967b49744905b5738e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_rate_limits" DROP CONSTRAINT "FK_1774c456fb1732f98fcee7d49c8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP CONSTRAINT "FK_f2374c524449ea4ed657d596115"`,
    );
    await queryRunner.query(`DROP TABLE "tenant_audit_logs"`);
    await queryRunner.query(`DROP TABLE "platform_audit_logs"`);
    await queryRunner.query(`DROP TABLE "domain_events"`);
    await queryRunner.query(`DROP TABLE "platform_settings"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TABLE "csr_analytics"`);
    await queryRunner.query(`DROP TABLE "tenant_analytics"`);
    await queryRunner.query(`DROP TABLE "canned_responses"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TABLE "product_categories"`);
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`DROP TABLE "conversations"`);
    await queryRunner.query(`DROP TABLE "customers"`);
    await queryRunner.query(`DROP TABLE "tenant_channels"`);
    await queryRunner.query(`DROP TABLE "channel_templates"`);
    await queryRunner.query(`DROP TABLE "tenant_rate_limits"`);
    await queryRunner.query(`DROP TABLE "subscription_plans"`);
    await queryRunner.query(`DROP TABLE "tenants"`);
    await queryRunner.query(`DROP TABLE "tenant_users"`);
    await queryRunner.query(`DROP TABLE "platform_admins"`);
  }
}
