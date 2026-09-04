import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlanDurationAndQuotaMode1782443900000 implements MigrationInterface {
  name = 'AddPlanDurationAndQuotaMode1782443900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" ADD "duration_days" integer NOT NULL DEFAULT 30`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" ADD "message_quota_mode" character varying NOT NULL DEFAULT 'combined'`,
    );
    // Quota limit columns become nullable so `null` can mean unlimited and
    // `0` can mean no usage permitted (Plan 8 fixed compatibility decision).
    for (const column of [
      'message_limit',
      'inbound_message_limit',
      'outbound_message_limit',
      'api_limit',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "subscription_plans" ALTER COLUMN "${column}" DROP NOT NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "subscription_plans" ALTER COLUMN "${column}" SET DEFAULT NULL`,
      );
    }

    // Convert the legacy all-zero "Enterprise" profile, which historically used
    // 0 to mean unlimited, to explicit NULL so runtime enforcement sees the
    // intended unlimited policy. The shape below is the exact seed profile that
    // previously encoded unlimited everywhere (limits and capacity all zero).
    await queryRunner.query(`
      UPDATE "subscription_plans"
      SET "message_limit" = NULL,
          "inbound_message_limit" = NULL,
          "outbound_message_limit" = NULL,
          "api_limit" = NULL
      WHERE "message_limit" = 0
        AND "inbound_message_limit" = 0
        AND "outbound_message_limit" = 0
        AND "api_limit" = 0
        AND "max_csrs" = 0
        AND "max_channels" = 0
        AND "storage_limit_gb" = 0
    `);

    // Mandatory manual-review report: any remaining zero limits are ambiguous
    // under the new semantics (0 = no usage permitted). Operators must confirm
    // these rows before the period-scoped enforcement cutover.
    const ambiguousRows = (await queryRunner.query(
      `SELECT id, name, message_limit, api_limit
       FROM "subscription_plans"
       WHERE "message_limit" = 0 OR "api_limit" = 0`,
    )) as Array<{
      id: string;
      name: string;
      message_limit: string | null;
      api_limit: string | null;
    }>;
    if (ambiguousRows.length > 0) {
      console.warn(
        '[subscription-period] Manual review required: these plans still have zero message/API limits (0 now means no usage permitted). Confirm whether each should be NULL (unlimited) or 0 (blocked):',
        ambiguousRows,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore legacy non-null defaults. Convert any nulls introduced by the
    // unlimited-semantics migration so SET NOT NULL cannot fail.
    for (const [column, fallback] of [
      ['message_limit', '1000'],
      ['inbound_message_limit', '0'],
      ['outbound_message_limit', '0'],
      ['api_limit', '5000'],
    ] as const) {
      await queryRunner.query(
        `UPDATE "subscription_plans" SET "${column}" = ${fallback} WHERE "${column}" IS NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "subscription_plans" ALTER COLUMN "${column}" SET DEFAULT ${fallback}`,
      );
      await queryRunner.query(
        `ALTER TABLE "subscription_plans" ALTER COLUMN "${column}" SET NOT NULL`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" DROP COLUMN "message_quota_mode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscription_plans" DROP COLUMN "duration_days"`,
    );
  }
}
