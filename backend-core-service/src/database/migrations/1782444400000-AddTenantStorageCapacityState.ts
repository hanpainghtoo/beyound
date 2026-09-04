import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantStorageCapacityState1782444400000 implements MigrationInterface {
  name = 'AddTenantStorageCapacityState1782444400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants"
        ADD COLUMN "storage_capacity_state" jsonb NOT NULL DEFAULT '{}'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN "storage_capacity_state"`,
    );
  }
}
