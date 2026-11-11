import { MigrationInterface, QueryRunner } from 'typeorm';

// Plan 25, Phase 6 (value rename): the review decision value `approve`
// collides with the period admin-approval axis (`adminActivationStatus`/
// `upgradeStatus` both use `approved`), so the billing review axis renames:
//   - record column `review_status`: 'approve'  -> 'confirm'
//   - proof level (metadata JSON):   'approved' -> 'confirmed'
//     (paths: paymentProof.status/.reviewStatus,
//      paymentProofSubmissions[*].status/.reviewStatus,
//      paymentProofReviews[*].outcome)
// `in_review` / `reject` / `pending_review` are untouched, as are all
// non-billing `approved` axes. Requires Migration B (old columns dropped).
// Order matters: the Phase-4 CHECK constraints still whitelist 'approve',
// so they are dropped before the rewrite and recreated on 'confirm'.
export class RenameBillingApproveToConfirm1782445500000 implements MigrationInterface {
  name = 'RenameBillingApproveToConfirm1782445500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Old CHECKs whitelist 'approve' — drop before rewriting values.
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP CONSTRAINT IF EXISTS "CHK_tenant_billing_records_review_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP CONSTRAINT IF EXISTS "CHK_tenant_billing_records_approved_amount"
    `);

    // 2. Record axis value rewrite.
    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "review_status" = 'confirm'
      WHERE "review_status" = 'approve'
    `);

    // 3. Proof level (metadata JSON): paymentProof.status + outcome mirror.
    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "metadata" = jsonb_set(
        "metadata",
        '{paymentProof}',
        (
          SELECT jsonb_object_agg(
            "pair"."key",
            CASE
              WHEN "pair"."key" IN ('status', 'reviewStatus')
                   AND "pair"."value" = '"approved"'::jsonb
              THEN '"confirmed"'::jsonb
              ELSE "pair"."value"
            END
          )
          FROM jsonb_each("metadata"->'paymentProof') AS "pair"
        )
      )
      WHERE "metadata"->'paymentProof'->>'status' = 'approved'
         OR "metadata"->'paymentProof'->>'reviewStatus' = 'approved'
    `);

    // 4. Submission history entries (status + outcome mirror).
    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "metadata" = jsonb_set(
        "metadata",
        '{paymentProofSubmissions}',
        COALESCE(
          (
            SELECT jsonb_agg(
              CASE
                WHEN "el"->>'status' = 'approved'
                  OR "el"->>'reviewStatus' = 'approved'
                THEN jsonb_set(
                       jsonb_set("el", '{status}', '"confirmed"'::jsonb),
                       '{reviewStatus}', '"confirmed"'::jsonb
                     )
                ELSE "el"
              END
              ORDER BY "ord"
            )
            FROM jsonb_array_elements("metadata"->'paymentProofSubmissions')
              WITH ORDINALITY AS "t"("el", "ord")
          ),
          "metadata"->'paymentProofSubmissions'
        )
      )
      WHERE jsonb_typeof("metadata"->'paymentProofSubmissions') = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements("metadata"->'paymentProofSubmissions') AS "el"
          WHERE "el"->>'status' = 'approved'
             OR "el"->>'reviewStatus' = 'approved'
        )
    `);

    // 5. Review history entries (outcome).
    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "metadata" = jsonb_set(
        "metadata",
        '{paymentProofReviews}',
        COALESCE(
          (
            SELECT jsonb_agg(
              CASE
                WHEN "el"->>'outcome' = 'approved'
                THEN jsonb_set("el", '{outcome}', '"confirmed"'::jsonb)
                ELSE "el"
              END
              ORDER BY "ord"
            )
            FROM jsonb_array_elements("metadata"->'paymentProofReviews')
              WITH ORDINALITY AS "t"("el", "ord")
          ),
          "metadata"->'paymentProofReviews'
        )
      )
      WHERE jsonb_typeof("metadata"->'paymentProofReviews') = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements("metadata"->'paymentProofReviews') AS "el"
          WHERE "el"->>'outcome' = 'approved'
        )
    `);

    // 6. Recreate CHECKs on the renamed value (approved-amount constraint
    // renamed to match).
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_review_status"
      CHECK ("review_status" IN ('in_review', 'confirm', 'reject'))
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_confirmed_amount"
      CHECK ("review_status" <> 'confirm' OR "amount_paid" = "amount_due")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP CONSTRAINT IF EXISTS "CHK_tenant_billing_records_review_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      DROP CONSTRAINT IF EXISTS "CHK_tenant_billing_records_confirmed_amount"
    `);

    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "review_status" = 'approve'
      WHERE "review_status" = 'confirm'
    `);

    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "metadata" = jsonb_set(
        "metadata",
        '{paymentProof}',
        (
          SELECT jsonb_object_agg(
            "pair"."key",
            CASE
              WHEN "pair"."key" IN ('status', 'reviewStatus')
                   AND "pair"."value" = '"confirmed"'::jsonb
              THEN '"approved"'::jsonb
              ELSE "pair"."value"
            END
          )
          FROM jsonb_each("metadata"->'paymentProof') AS "pair"
        )
      )
      WHERE "metadata"->'paymentProof'->>'status' = 'confirmed'
         OR "metadata"->'paymentProof'->>'reviewStatus' = 'confirmed'
    `);

    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "metadata" = jsonb_set(
        "metadata",
        '{paymentProofSubmissions}',
        COALESCE(
          (
            SELECT jsonb_agg(
              CASE
                WHEN "el"->>'status' = 'confirmed'
                  OR "el"->>'reviewStatus' = 'confirmed'
                THEN jsonb_set(
                       jsonb_set("el", '{status}', '"approved"'::jsonb),
                       '{reviewStatus}', '"approved"'::jsonb
                     )
                ELSE "el"
              END
              ORDER BY "ord"
            )
            FROM jsonb_array_elements("metadata"->'paymentProofSubmissions')
              WITH ORDINALITY AS "t"("el", "ord")
          ),
          "metadata"->'paymentProofSubmissions'
        )
      )
      WHERE jsonb_typeof("metadata"->'paymentProofSubmissions') = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements("metadata"->'paymentProofSubmissions') AS "el"
          WHERE "el"->>'status' = 'confirmed'
             OR "el"->>'reviewStatus' = 'confirmed'
        )
    `);

    await queryRunner.query(`
      UPDATE "tenant_billing_records"
      SET "metadata" = jsonb_set(
        "metadata",
        '{paymentProofReviews}',
        COALESCE(
          (
            SELECT jsonb_agg(
              CASE
                WHEN "el"->>'outcome' = 'confirmed'
                THEN jsonb_set("el", '{outcome}', '"approved"'::jsonb)
                ELSE "el"
              END
              ORDER BY "ord"
            )
            FROM jsonb_array_elements("metadata"->'paymentProofReviews')
              WITH ORDINALITY AS "t"("el", "ord")
          ),
          "metadata"->'paymentProofReviews'
        )
      )
      WHERE jsonb_typeof("metadata"->'paymentProofReviews') = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements("metadata"->'paymentProofReviews') AS "el"
          WHERE "el"->>'outcome' = 'confirmed'
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_review_status"
      CHECK ("review_status" IN ('in_review', 'approve', 'reject'))
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_billing_records"
      ADD CONSTRAINT "CHK_tenant_billing_records_approved_amount"
      CHECK ("review_status" <> 'approve' OR "amount_paid" = "amount_due")
    `);
  }
}
