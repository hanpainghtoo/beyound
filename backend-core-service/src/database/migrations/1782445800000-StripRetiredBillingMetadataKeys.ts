import { MigrationInterface, QueryRunner } from 'typeorm';

// Plan 27 (billing metadata cleanup): strip retired top-level metadata keys.
// - `overdueMarkedAt`, `reminderHistory`, `lastReminder`: written only by the
//   Plan-26-removed `send-reminder` endpoint; zero readers since.
// - `paymentReversal`, `paymentReversals`: Plan 27 stops the reverse flow
//   from writing them; nothing ever read them outside specs.
// DOWN is an intentional no-op: deleted JSON is unrestorable. Dev pre-check
// (2026-09-08): 26 rows, 0 contain any of these keys — no-op locally; prod
// may hold reminder history from before the Plan 26 removal.
export class StripRetiredBillingMetadataKeys1782445800000 implements MigrationInterface {
  name = 'StripRetiredBillingMetadataKeys1782445800000';

  private static readonly retiredKeys = [
    'overdueMarkedAt',
    'reminderHistory',
    'lastReminder',
    'paymentReversal',
    'paymentReversals',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "tenant_billing_records"
       SET "metadata" = "metadata"
         - 'overdueMarkedAt' - 'reminderHistory' - 'lastReminder'
         - 'paymentReversal' - 'paymentReversals'
       WHERE "metadata" ?| $1`,
      [StripRetiredBillingMetadataKeys1782445800000.retiredKeys],
    );
  }

  public async down(): Promise<void> {
    // Intentional no-op: stripped keys cannot be restored.
  }
}
