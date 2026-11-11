import { MigrationInterface, QueryRunner } from 'typeorm';

// Plan 25, Migration A (additive, non-breaking): meeting-decision columns.
// Old columns/flows keep running; backfills map old state onto new columns.
export class BillingMeetingDecisionColumns1782445300000 implements MigrationInterface {
  name = 'BillingMeetingDecisionColumns1782445300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE SEQUENCE IF NOT EXISTS "billing_invoice_no_seq" START 1`,
    );
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD COLUMN "invoice_no" character varying,
      ADD COLUMN "review_status" character varying NOT NULL DEFAULT 'in_review',
      ADD COLUMN "action_by" uuid,
      ADD COLUMN "action_date" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "issue_date" date,
      ADD COLUMN "payment_proof_file_id" uuid
    `);

    // Sequential meeting numbers in created_at order.
    await queryRunner.query(`
      WITH ordered AS (
        SELECT "id",
          ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS "rn"
        FROM "tenant_billing_records"
        WHERE "invoice_no" IS NULL
      )
      UPDATE "tenant_billing_records" AS "r"
      SET "invoice_no" = 'INV-' || LPAD("o"."rn"::text, 5, '0')
      FROM ordered AS "o"
      WHERE "r"."id" = "o"."id"
    `);
    await queryRunner.query(`
      SELECT setval(
        'billing_invoice_no_seq',
        COALESCE((SELECT COUNT(*) FROM "tenant_billing_records"), 0) + 1,
        false
      )
    `);

    // Review status from paid state + proof review state.
    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "review_status" = 'approve'
      WHERE "payment_status" = 'paid'
    `);
    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "review_status" = 'reject'
      WHERE "metadata"->'paymentProof'->>'status' = 'rejected'
    `);

    // Review actor/action time from the last proof-review entry (uuid-guarded).
    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "action_by" = (
        CASE
          WHEN ("metadata"->'paymentProofReviews'->-1->>'reviewedBy') ~ '^[0-9a-fA-F-]{36}$'
          THEN ("metadata"->'paymentProofReviews'->-1->>'reviewedBy')::uuid
          ELSE NULL
        END
      ),
      "action_date" = (
        CASE
          WHEN ("metadata"->'paymentProofReviews'->-1->>'reviewedAt') ~ '^\\d{4}-\\d{2}-\\d{2}'
          THEN ("metadata"->'paymentProofReviews'->-1->>'reviewedAt')::timestamptz
          WHEN "payment_status" = 'paid' THEN "paid_at"
          ELSE NULL
        END
      )
      WHERE "metadata"->'paymentProofReviews' IS NOT NULL
    `);

    // Issue day from creation; proof image promoted from metadata.
    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "issue_date" = "created_at"::date
      WHERE "issue_date" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "payment_proof_file_id" = (
        CASE
          WHEN ("metadata"->'paymentProof'->>'mediaFileId') ~ '^[0-9a-fA-F-]{36}$'
          THEN ("metadata"->'paymentProof'->>'mediaFileId')::uuid
          ELSE NULL
        END
      )
      WHERE ("metadata"->'paymentProof'->>'mediaFileId') IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP COLUMN "payment_proof_file_id",
      DROP COLUMN "issue_date",
      DROP COLUMN "action_date",
      DROP COLUMN "action_by",
      DROP COLUMN "review_status",
      DROP COLUMN "invoice_no"
    `);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS "billing_invoice_no_seq"`);
  }
}
