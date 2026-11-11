import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProviderInboundIdempotency1782442600000 implements MigrationInterface {
  name = 'AddProviderInboundIdempotency1782442600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertNoDuplicateRows(
      queryRunner,
      'messages',
      `
        SELECT tc.channel_type AS provider, c.channel_id, m.external_message_id, COUNT(*)::int AS duplicate_count
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        LEFT JOIN tenant_channels tc ON tc.id = c.channel_id
        WHERE m.external_message_id IS NOT NULL
        GROUP BY tc.channel_type, c.channel_id, m.external_message_id
        HAVING COUNT(*) > 1
      `,
    );
    await this.assertNoDuplicateRows(
      queryRunner,
      'customers',
      `
        SELECT tc.channel_type AS provider, c.channel_id, c.external_id, COUNT(*)::int AS duplicate_count
        FROM customers c
        LEFT JOIN tenant_channels tc ON tc.id = c.channel_id
        WHERE c.external_id IS NOT NULL
        GROUP BY tc.channel_type, c.channel_id, c.external_id
        HAVING COUNT(*) > 1
      `,
    );
    await this.assertNoDuplicateRows(
      queryRunner,
      'conversations',
      `
        SELECT tc.channel_type AS provider, c.channel_id, c.conversation_id, COUNT(*)::int AS duplicate_count
        FROM conversations c
        LEFT JOIN tenant_channels tc ON tc.id = c.channel_id
        WHERE c.conversation_id IS NOT NULL
        GROUP BY tc.channel_type, c.channel_id, c.conversation_id
        HAVING COUNT(*) > 1
      `,
    );

    await queryRunner.query(
      `ALTER TABLE "messages" ADD "provider" character varying`,
    );
    await queryRunner.query(`ALTER TABLE "messages" ADD "channel_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "customers" ADD "provider" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD "provider" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" ADD "source_event_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" ADD "source_message_id" uuid`,
    );

    await queryRunner.query(`
      UPDATE "messages" m
      SET
        "provider" = tc."channel_type",
        "channel_id" = c."channel_id"
      FROM "conversations" c
      JOIN "tenant_channels" tc ON tc."id" = c."channel_id"
      WHERE c."id" = m."conversation_id"
        AND (m."provider" IS NULL OR m."channel_id" IS NULL)
    `);
    await queryRunner.query(`
      UPDATE "customers" c
      SET "provider" = tc."channel_type"
      FROM "tenant_channels" tc
      WHERE tc."id" = c."channel_id"
        AND c."provider" IS NULL
        AND c."external_id" IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE "conversations" c
      SET "provider" = tc."channel_type"
      FROM "tenant_channels" tc
      WHERE tc."id" = c."channel_id"
        AND c."provider" IS NULL
        AND c."conversation_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "inbound_provider_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "provider" character varying NOT NULL,
        "tenant_id" uuid NOT NULL,
        "channel_id" uuid NOT NULL,
        "provider_event_id" character varying NOT NULL,
        "provider_message_id" character varying,
        "provider_conversation_id" character varying,
        "provider_customer_id" character varying,
        "event_type" character varying NOT NULL DEFAULT 'message',
        "payload_hash" character varying,
        "processing_status" character varying NOT NULL DEFAULT 'received',
        "occurred_at" TIMESTAMP NOT NULL,
        "received_at" TIMESTAMP NOT NULL,
        "processed_at" TIMESTAMP,
        "message_id" uuid,
        "failure_code" character varying,
        "retry_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inbound_provider_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_inbound_provider_events_provider_channel_event"
      ON "inbound_provider_events" ("provider", "channel_id", "provider_event_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_inbound_provider_events_tenant_channel"
      ON "inbound_provider_events" ("tenant_id", "channel_id", "provider", "received_at")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_messages_provider_channel_external_message"
      ON "messages" ("provider", "channel_id", "external_message_id")
      WHERE "external_message_id" IS NOT NULL AND "provider" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_customers_provider_channel_external"
      ON "customers" ("provider", "channel_id", "external_id")
      WHERE "external_id" IS NOT NULL AND "provider" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_conversations_provider_channel_external"
      ON "conversations" ("provider", "channel_id", "conversation_id")
      WHERE "conversation_id" IS NOT NULL AND "provider" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_usage_events_source_event"
      ON "tenant_usage_events" ("usage_type", "source_event_id")
      WHERE "source_event_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_usage_events_source_message"
      ON "tenant_usage_events" ("usage_type", "source_message_id")
      WHERE "source_message_id" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "inbound_provider_events"
      ADD CONSTRAINT "FK_inbound_provider_events_tenant"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "inbound_provider_events"
      ADD CONSTRAINT "FK_inbound_provider_events_channel"
      FOREIGN KEY ("channel_id") REFERENCES "tenant_channels"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "inbound_provider_events"
      ADD CONSTRAINT "FK_inbound_provider_events_message"
      FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inbound_provider_events" DROP CONSTRAINT "FK_inbound_provider_events_message"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inbound_provider_events" DROP CONSTRAINT "FK_inbound_provider_events_channel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inbound_provider_events" DROP CONSTRAINT "FK_inbound_provider_events_tenant"`,
    );
    await queryRunner.query(`DROP INDEX "uq_usage_events_source_message"`);
    await queryRunner.query(`DROP INDEX "uq_usage_events_source_event"`);
    await queryRunner.query(
      `DROP INDEX "uq_conversations_provider_channel_external"`,
    );
    await queryRunner.query(
      `DROP INDEX "uq_customers_provider_channel_external"`,
    );
    await queryRunner.query(
      `DROP INDEX "uq_messages_provider_channel_external_message"`,
    );
    await queryRunner.query(
      `DROP INDEX "idx_inbound_provider_events_tenant_channel"`,
    );
    await queryRunner.query(
      `DROP INDEX "uq_inbound_provider_events_provider_channel_event"`,
    );
    await queryRunner.query(`DROP TABLE "inbound_provider_events"`);
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" DROP COLUMN "source_message_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_usage_events" DROP COLUMN "source_event_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversations" DROP COLUMN "provider"`,
    );
    await queryRunner.query(`ALTER TABLE "customers" DROP COLUMN "provider"`);
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "provider"`);
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "channel_id"`);
  }

  private async assertNoDuplicateRows(
    queryRunner: QueryRunner,
    label: string,
    sql: string,
  ) {
    const duplicates = (await queryRunner.query(sql)) as Array<{
      duplicate_count: number;
    }>;
    if (duplicates.length > 0) {
      const total = duplicates
        .map((row) => Number(row.duplicate_count || 0))
        .reduce((sum, count) => sum + count, 0);
      throw new Error(
        `Cannot add provider idempotency constraints while duplicate ${label} exist. Duplicate groups: ${duplicates.length}; affected rows: ${total}. Run backend-core-service/scripts/preflight-provider-idempotency-duplicates.sql and resolve duplicates first.`,
      );
    }
  }
}
