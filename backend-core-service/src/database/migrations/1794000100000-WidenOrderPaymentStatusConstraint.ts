import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The commerce status simplification migration constrained
 * `orders.payment_status` to ('unpaid', 'paid'). Partial payments are now
 * first-class, so recording any payment smaller than the remaining balance
 * failed with a 500 when the order row was updated. Widen the constraint so
 * the ledger-derived `partially_paid` status can be persisted.
 */
export class WidenOrderPaymentStatusConstraint1794000100000
  implements MigrationInterface
{
  name = 'WidenOrderPaymentStatusConstraint1794000100000';

  async up(q: QueryRunner) {
    await q.query(`
      ALTER TABLE "orders"
        DROP CONSTRAINT IF EXISTS "CHK_orders_payment_status_simplified"
    `);
    await q.query(`
      ALTER TABLE "orders"
        ADD CONSTRAINT "CHK_orders_payment_status_simplified"
        CHECK ("payment_status" IN ('unpaid', 'partially_paid', 'paid'))
    `);
  }

  async down(q: QueryRunner) {
    await q.query(`
      ALTER TABLE "orders"
        DROP CONSTRAINT IF EXISTS "CHK_orders_payment_status_simplified"
    `);
    // The narrower constraint cannot represent partial payments.
    await q.query(`
      UPDATE "orders"
        SET "payment_status" = 'unpaid'
        WHERE "payment_status" = 'partially_paid'
    `);
    await q.query(`
      ALTER TABLE "orders"
        ADD CONSTRAINT "CHK_orders_payment_status_simplified"
        CHECK ("payment_status" IN ('unpaid', 'paid'))
    `);
  }
}
