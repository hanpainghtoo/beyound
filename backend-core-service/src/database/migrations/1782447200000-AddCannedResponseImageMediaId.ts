import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Saved-reply photos are stored in the separate file-storage service, so this
 * is an opaque reference rather than a foreign key — there is no media table in
 * this database to point at. Nullable: most saved replies have no photo.
 */
export class AddCannedResponseImageMediaId1782447200000 implements MigrationInterface {
  name = 'AddCannedResponseImageMediaId1782447200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "canned_responses" ADD "image_media_id" character varying`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "canned_responses" DROP COLUMN "image_media_id"`,
    );
  }
}
