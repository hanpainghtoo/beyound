import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillPaymentMethodEditPermission1782447700000 implements MigrationInterface {
  name = 'BackfillPaymentMethodEditPermission1782447700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tenant_payment_method_permission_backfill (
        tenant_user_id uuid PRIMARY KEY REFERENCES tenant_users(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      INSERT INTO tenant_payment_method_permission_backfill (tenant_user_id)
      SELECT id
      FROM tenant_users
      WHERE role IN ('owner', 'admin')
        AND NOT (permissions ? 'tenant.payment_methods.edit')
      ON CONFLICT (tenant_user_id) DO NOTHING
    `);
    await queryRunner.query(`
      UPDATE tenant_users AS users
      SET permissions = users.permissions || '{"tenant.payment_methods.edit": true}'::jsonb
      FROM tenant_payment_method_permission_backfill AS backfill
      WHERE users.id = backfill.tenant_user_id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE tenant_users AS users
      SET permissions = users.permissions - 'tenant.payment_methods.edit'
      FROM tenant_payment_method_permission_backfill AS backfill
      WHERE users.id = backfill.tenant_user_id
    `);
    await queryRunner.query(
      `DROP TABLE IF EXISTS tenant_payment_method_permission_backfill`,
    );
  }
}
