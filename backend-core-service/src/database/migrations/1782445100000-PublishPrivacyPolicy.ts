import type { MigrationInterface, QueryRunner } from 'typeorm';

const policyKey = 'privacy_policy';
const policyVersion = 'privacy-2026-07-20';
const effectiveAt = '2026-07-20T00:00:00.000Z';
const supportEmail = 'support@kme.com.mm';
const legalEmail = '';
const placeholderVersion = '1.0';
const placeholderPattern = '%content coming soon%';
const policyContent = `ZayOS Privacy Policy

This Privacy Policy explains how ZayOS collects, uses, protects, retains, and deletes information when merchants, team members, customers, or site visitors use ZayOS websites, dashboards, commerce workspaces, messaging integrations, and related services.

Information we collect

We collect account and workspace information such as names, business names, work email addresses, phone numbers, roles, authentication data, subscription selections, and support requests. We also process operational workspace data, including conversations, customer records, products, orders, delivery activity, uploaded media, saved replies, audit logs, and integration settings submitted by users or connected channels.

When you connect third-party messaging, social, delivery, payment, analytics, or storage services, ZayOS may receive information that those services make available under your settings and their platform rules. This can include message metadata, customer identifiers, message content, attachments, channel status, and delivery events.

How we use information

We use information to provide and secure the ZayOS service, create and manage merchant workspaces, route conversations, support orders and deliveries, maintain customer and product records, provide reporting, process support requests, monitor abuse, improve reliability, comply with legal obligations, and communicate service updates.

How we share information

We do not sell personal information. We share information only with service providers, integration partners selected or configured by a workspace, legal or compliance recipients when required, and authorized workspace members according to their roles. Third-party providers process information under their own terms when a workspace connects those services.

Security

ZayOS applies administrative, technical, and organizational safeguards designed to protect information against unauthorized access, misuse, loss, or alteration. No internet service can guarantee absolute security, but we work to keep controls appropriate for the sensitivity of the data we process.

Retention and deletion

We retain information for as long as needed to provide the service, satisfy legal and accounting obligations, resolve disputes, enforce agreements, maintain security records, and support legitimate business operations. Workspace owners may request export or deletion of workspace data by contacting support. Some data may remain in backups, audit records, security logs, or legally required records for a limited period.

Your choices

You may update account information in the workspace, disconnect integrations, request access to personal information, request correction, request deletion, or object to certain processing where applicable. To make a privacy request, contact support@kme.com.mm.

Children

ZayOS is intended for business use and is not directed to children.

Changes

We may update this Privacy Policy as the service, laws, or business practices change. Updated versions will be posted on this page with a new effective date.`;

export class PublishPrivacyPolicy1782445100000 implements MigrationInterface {
  name = 'PublishPrivacyPolicy1782445100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "legal_policies" (
        "id",
        "policy_key",
        "version",
        "status",
        "title",
        "content",
        "content_format",
        "effective_at",
        "published_at",
        "published_by_id",
        "support_email",
        "legal_email",
        "metadata",
        "created_at",
        "updated_at"
      )
      SELECT
        uuid_generate_v4(),
        $1::varchar,
        $2::varchar,
        'published',
        'Privacy Policy',
        $3::text,
        'markdown',
        $4::timestamp,
        $4::timestamp,
        NULL,
        $5::varchar,
        $6::varchar,
        '{}'::jsonb,
        NOW(),
        NOW()
      WHERE NOT EXISTS (
        SELECT 1
          FROM "legal_policies"
         WHERE "policy_key" = $1::varchar AND "version" = $2::varchar
      )`,
      [
        policyKey,
        policyVersion,
        policyContent,
        effectiveAt,
        supportEmail,
        legalEmail,
      ],
    );

    // Retire only published placeholder content. Existing approved policy
    // versions remain available for historical links and consent evidence.
    await queryRunner.query(
      `UPDATE "legal_policies"
          SET "status" = 'retired', "updated_at" = NOW()
        WHERE "policy_key" = $1::varchar
          AND "version" <> $2::varchar
          AND "status" = 'published'
          AND "content" ILIKE $3::text`,
      [policyKey, policyVersion, placeholderPattern],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "legal_policies"
        WHERE "policy_key" = $1::varchar AND "version" = $2::varchar`,
      [policyKey, policyVersion],
    );

    await queryRunner.query(
      `UPDATE "legal_policies"
          SET "status" = 'published', "updated_at" = NOW()
        WHERE "policy_key" = $1::varchar
          AND "version" = $2::varchar
          AND "status" = 'retired'
          AND "content" ILIKE $3::text`,
      [policyKey, placeholderVersion, placeholderPattern],
    );
  }
}
