import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tenant payment methods are no longer capped.
 *
 * Product decision (workspace "Payments and Order setting"): a tenant may
 * publish any number of customer payment cards, including duplicate
 * built-in kinds (e.g. two KBZPay accounts), each toggled active/inactive
 * individually. The original caps live in three places and all three go:
 *
 *  - trigger `trg_payment_method_limits` (≤4 total, ≤2 custom, ≤2 enabled
 *    custom) from migration 1782447600000,
 *  - function `enforce_payment_method_limits()` backing that trigger,
 *  - partial unique index `uq_payment_method_builtin_version`
 *    (version_id, kind) WHERE kind <> 'other', which blocked duplicate
 *    built-in kinds per version.
 *
 * The kind whitelist (chk_payment_method_kind) stays: kbzpay | aya_pay |
 * other. Tenant isolation is unaffected — every read/write remains scoped
 * by tenant_id from the JWT.
 */
export class RemovePaymentMethodLimits1793255778000
  implements MigrationInterface
{
  name = 'RemovePaymentMethodLimits1793255778000';

  async up(q: QueryRunner) {
    await q.query(
      `DROP TRIGGER IF EXISTS trg_payment_method_limits ON tenant_payment_methods`,
    );
    await q.query(`DROP FUNCTION IF EXISTS enforce_payment_method_limits()`);
    await q.query(`DROP INDEX IF EXISTS uq_payment_method_builtin_version`);
  }

  async down(q: QueryRunner) {
    // Reversal re-imposes the old caps. If the tenant has since saved more
    // than the caps allow (or duplicate built-ins), index creation fails —
    // the data itself must be pruned by hand first.
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
  }
}
