import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsageSourceRequestId1782443600000 implements MigrationInterface {
  name = 'AddUsageSourceRequestId1782443600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" ADD "source_request_id" character varying`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_tenant_usage_events_source_request" ON "tenant_usage_events" ("tenant_id", "usage_type", "source_request_id") WHERE "source_request_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "UQ_tenant_usage_events_source_request"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" DROP COLUMN "source_request_id"`,
    );
  }
}
