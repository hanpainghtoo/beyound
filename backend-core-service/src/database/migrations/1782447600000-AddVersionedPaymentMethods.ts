import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVersionedPaymentMethods1782447600000 implements MigrationInterface {
  name = 'AddVersionedPaymentMethods1782447600000';
  async up(q: QueryRunner) {
    await q.query(
      `CREATE TABLE IF NOT EXISTS tenant_payment_method_versions (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, version integer NOT NULL, status varchar NOT NULL DEFAULT 'draft', published_by uuid NULL REFERENCES tenant_users(id) ON DELETE SET NULL, published_at timestamptz NULL, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT chk_payment_method_version_status CHECK (status IN ('draft','published')), CONSTRAINT uq_payment_method_version_tenant_version UNIQUE (tenant_id, version))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_method_published_version ON tenant_payment_method_versions(tenant_id) WHERE status = 'published'`,
    );
    await q.query(
      `CREATE TABLE IF NOT EXISTS tenant_payment_methods (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, version_id uuid NOT NULL REFERENCES tenant_payment_method_versions(id) ON DELETE CASCADE, kind varchar NOT NULL, name varchar NOT NULL, enabled boolean NOT NULL DEFAULT false, display_order integer NOT NULL DEFAULT 0, account_name varchar NOT NULL, account_number varchar NOT NULL, qr_media_id varchar NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, CONSTRAINT chk_payment_method_kind CHECK (kind IN ('kbzpay','aya_pay','other')))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_method_builtin_version ON tenant_payment_methods(version_id, kind) WHERE kind <> 'other'`,
    );
    await q.query(
      `CREATE OR REPLACE FUNCTION enforce_payment_method_limits() RETURNS trigger LANGUAGE plpgsql AS $fn$ DECLARE total_count integer; custom_count integer; enabled_custom_count integer; BEGIN SELECT COUNT(*), COUNT(*) FILTER (WHERE kind = 'other'), COUNT(*) FILTER (WHERE kind = 'other' AND enabled) INTO total_count, custom_count, enabled_custom_count FROM tenant_payment_methods WHERE version_id = NEW.version_id AND id <> NEW.id; IF total_count >= 4 OR custom_count >= 2 AND NEW.kind = 'other' OR enabled_custom_count >= 2 AND NEW.kind = 'other' AND NEW.enabled THEN RAISE EXCEPTION 'payment_method_limit_exceeded'; END IF; RETURN NEW; END; $fn$`,
    );
    await q.query(
      `DROP TRIGGER IF EXISTS trg_payment_method_limits ON tenant_payment_methods`,
    );
    await q.query(
      `CREATE TRIGGER trg_payment_method_limits BEFORE INSERT OR UPDATE ON tenant_payment_methods FOR EACH ROW EXECUTE FUNCTION enforce_payment_method_limits()`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_payment_method_tenant_enabled ON tenant_payment_methods(tenant_id, enabled)`,
    );
    await q.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method_id uuid NULL, ADD COLUMN IF NOT EXISTS payment_method_config_version integer NULL, ADD COLUMN IF NOT EXISTS payment_method_snapshot jsonb NULL, ADD COLUMN IF NOT EXISTS payment_total_snapshot jsonb NULL, ADD COLUMN IF NOT EXISTS payment_method_selected_at timestamptz NULL, ADD COLUMN IF NOT EXISTS payment_method_selected_by uuid NULL, ADD COLUMN IF NOT EXISTS payment_submitted_at timestamptz NULL`,
    );
  }
  async down(q: QueryRunner) {
    await q.query(
      `ALTER TABLE orders DROP COLUMN IF EXISTS payment_submitted_at, DROP COLUMN IF EXISTS payment_method_selected_by, DROP COLUMN IF EXISTS payment_method_selected_at, DROP COLUMN IF EXISTS payment_total_snapshot, DROP COLUMN IF EXISTS payment_method_snapshot, DROP COLUMN IF EXISTS payment_method_config_version, DROP COLUMN IF EXISTS payment_method_id`,
    );
    await q.query(`DROP INDEX IF EXISTS idx_payment_method_tenant_enabled`);
    await q.query(`DROP INDEX IF EXISTS uq_payment_method_builtin_version`);
    await q.query(
      `DROP TRIGGER IF EXISTS trg_payment_method_limits ON tenant_payment_methods`,
    );
    await q.query(`DROP TABLE IF EXISTS tenant_payment_methods`);
    await q.query(`DROP FUNCTION IF EXISTS enforce_payment_method_limits()`);
    await q.query(`DROP INDEX IF EXISTS uq_payment_method_published_version`);
    await q.query(`DROP TABLE IF EXISTS tenant_payment_method_versions`);
  }
}
