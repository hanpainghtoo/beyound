import { MigrationInterface, QueryRunner } from 'typeorm';

export class InvalidateActiveTeamInviteTokens1782442300000 implements MigrationInterface {
  name = 'InvalidateActiveTeamInviteTokens1782442300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "password_reset_tokens"
       SET "used_at" = now(), "updated_at" = now()
       WHERE "used_at" IS NULL
         AND "metadata"->>'purpose' = 'team_invite'`,
    );
  }

  public async down(): Promise<void> {
    // Invitation token invalidation is intentionally irreversible.
  }
}
