import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 10 hardening: idempotency keys are scoped to their tenant and
 * lifecycle operation. The same client key may safely be reused by another
 * tenant or by a different add-on mutation (create, confirm, cancel, expire).
 */
export class ScopeAddOnIdempotencyIndexes1782444700000 implements MigrationInterface {
  name = 'ScopeAddOnIdempotencyIndexes1782444700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_subscription_add_on_purchases_idempotency"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_subscription_add_on_purchases_idempotency" ON "tenant_subscription_add_on_purchases" ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_subscription_add_on_purchase_events_idempotency"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_subscription_add_on_purchase_events_idempotency" ON "tenant_subscription_add_on_purchase_events" ("tenant_id", "event_type", "idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_subscription_add_on_purchase_events_idempotency"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_subscription_add_on_purchase_events_idempotency" ON "tenant_subscription_add_on_purchase_events" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_subscription_add_on_purchases_idempotency"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_subscription_add_on_purchases_idempotency" ON "tenant_subscription_add_on_purchases" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
  }
}
