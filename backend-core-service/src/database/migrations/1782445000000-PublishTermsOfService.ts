import type { MigrationInterface, QueryRunner } from 'typeorm';

const policyKey = 'terms_of_service';
const policyVersion = 'terms-2026-07-20';
const effectiveAt = '2026-07-20T00:00:00.000Z';
const supportEmail = 'support@kme.com.mm';
const legalEmail = '';
const placeholderVersion = '1.0';
const placeholderContent = 'Terms of service content coming soon.';
const policyContent = `These Terms of Service ("Terms") govern access to and use of ZayOS, including its websites, dashboards, commerce workspaces, messaging integrations, APIs, and related services (together, the "Service"), operated by KME Solutions Company Limited ("ZayOS," "we," "us," or "our"). By creating an account, connecting a channel, or otherwise using the Service, you agree to these Terms on behalf of yourself and, if applicable, the business you represent.

Eligibility and accounts

You must be authorized to act on behalf of the business or workspace you register. You are responsible for the accuracy of information provided during signup, for maintaining the security of your account credentials, and for all activity that occurs under your account or workspace. Notify us promptly at support@kme.com.mm if you suspect unauthorized access.

Description of the Service

ZayOS provides a commerce and messaging workspace that allows merchants to manage customer conversations, orders, products, deliveries, and related operational records, including through integrations with third-party messaging, social, delivery, payment, analytics, and storage platforms that a workspace owner chooses to connect.

Subscriptions, plans, and billing

Certain features are available under paid subscription plans. Fees, billing cycles, and plan limits (including channel and usage limits) are as described at the time of purchase or in your workspace settings. Fees are non-refundable except as required by law or as separately agreed in writing. We may change pricing or plan features with reasonable notice; continued use after a change takes effect constitutes acceptance of the new terms.

Acceptable use

You agree not to use the Service to violate applicable law, infringe others' rights, transmit unsolicited or abusive messages, distribute malware, circumvent security measures, or misuse connected third-party platforms in violation of their own terms (including Meta's Platform Terms and Developer Policies where Messenger or other Meta channels are connected). We may suspend or terminate access for violations of this section.

Your content and data

You retain ownership of the business, customer, and operational data you submit to or generate within your workspace ("Customer Data"). You grant us a limited license to host, process, and transmit Customer Data solely to provide and support the Service. Our handling of personal information is further described in our Privacy Policy at https://zayos.com.mm/privacy-policy.

Third-party integrations

When you connect a third-party service (including Facebook Messenger, Telegram, TikTok, or others), that service's own terms and privacy practices apply to data it processes, in addition to these Terms. We are not responsible for the availability, accuracy, or practices of third-party platforms. Disconnecting an integration does not automatically delete data already retained by that third party.

Intellectual property

The Service, including its software, design, and branding, is owned by KME Solutions Company Limited or its licensors and is protected by applicable intellectual property laws. These Terms do not grant you any rights to our trademarks, logos, or proprietary technology beyond what is necessary to use the Service as intended.

Service availability

We aim to provide reliable access to the Service but do not guarantee uninterrupted or error-free operation. We may perform maintenance, updates, or changes to the Service from time to time, with notice where practicable for material changes.

Disclaimers

The Service is provided "as is" and "as available" without warranties of any kind, express or implied, including fitness for a particular purpose, merchantability, or non-infringement, to the fullest extent permitted by applicable law.

Limitation of liability

To the fullest extent permitted by law, ZayOS and its officers, employees, and affiliates will not be liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits or revenue, arising from or related to your use of the Service. Our total liability for any claim arising from these Terms or the Service is limited to the amount you paid us in the twelve months preceding the claim.

Indemnification

You agree to indemnify and hold ZayOS harmless from claims, damages, and expenses arising from your use of the Service, your Customer Data, or your violation of these Terms or applicable law.

Termination

You may stop using the Service and close your workspace at any time. We may suspend or terminate access for violation of these Terms, non-payment, or legal or security concerns. Upon termination, provisions that by their nature should survive (including intellectual property, disclaimers, limitation of liability, and indemnification) will continue to apply.

Changes to these Terms

We may update these Terms as the Service, laws, or business practices change. Updated versions will be posted on this page with a new effective date. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.

Governing law

These Terms are governed by the laws of the Republic of the Union of Myanmar, without regard to conflict-of-law principles, unless otherwise required by applicable law.

Contact Us

If you have any questions about these Terms, please contact us at support@kme.com.mm.`;

export class PublishTermsOfService1782445000000 implements MigrationInterface {
  name = 'PublishTermsOfService1782445000000';

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
        'Terms of Service',
        $3,
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

    // The original demo seed published this placeholder with a runtime
    // effective date. Retire only that known placeholder so it cannot outrank
    // the approved policy if it was seeded after 2026-07-20.
    await queryRunner.query(
      `UPDATE "legal_policies"
          SET "status" = 'retired', "updated_at" = NOW()
        WHERE "policy_key" = $1::varchar
          AND "version" <> $2::varchar
          AND "status" = 'published'
          AND "content" = $3::text`,
      [policyKey, policyVersion, placeholderContent],
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
          AND "content" = $3::text`,
      [policyKey, placeholderVersion, placeholderContent],
    );
  }
}
