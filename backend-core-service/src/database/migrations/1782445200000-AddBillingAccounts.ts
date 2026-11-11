import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBillingAccounts1782445200000 implements MigrationInterface {
  name = 'AddBillingAccounts1782445200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "billing_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "icon" character varying,
        "account_name" character varying(100) NOT NULL,
        "type" character varying(30) NOT NULL DEFAULT 'bank_account',
        "account_no" character varying,
        "phno" character varying,
        "qr" character varying,
        "is_public" boolean NOT NULL DEFAULT true,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_date" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_date" TIMESTAMP NOT NULL DEFAULT now(),
        "created_by" uuid NOT NULL,
        "updated_by" uuid NOT NULL,
        CONSTRAINT "PK_billing_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_billing_accounts_type" CHECK ("type" IN ('bank_account', 'digital_wallet'))
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_billing_accounts_active_type_public"
         ON "billing_accounts" ("is_active", "type", "is_public")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_billing_accounts_account_name"
         ON "billing_accounts" ("account_name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_accounts"
         ADD CONSTRAINT "FK_billing_accounts_created_by"
         FOREIGN KEY ("created_by") REFERENCES "platform_admins"("id")
         ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_accounts"
         ADD CONSTRAINT "FK_billing_accounts_updated_by"
         FOREIGN KEY ("updated_by") REFERENCES "platform_admins"("id")
         ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing_accounts" DROP CONSTRAINT "FK_billing_accounts_updated_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_accounts" DROP CONSTRAINT "FK_billing_accounts_created_by"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_billing_accounts_account_name"`);
    await queryRunner.query(
      `DROP INDEX "IDX_billing_accounts_active_type_public"`,
    );
    await queryRunner.query(`DROP TABLE "billing_accounts"`);
  }
}
