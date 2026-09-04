import type { PublicLegalPolicy } from "@/lib/public-legal-policies"

const effectiveAt = "2026-07-20T00:00:00.000Z"
const supportEmail = "support@kme.com.mm"
const legalEmail = ""

export const fallbackLegalPolicies: Record<PublicLegalPolicy["policyKey"], PublicLegalPolicy> = {
  privacy_policy: {
    policyKey: "privacy_policy",
    version: "privacy-2026-07-20",
    title: "Privacy Policy",
    effectiveAt,
    supportEmail,
    legalEmail,
    content: `ZayOS Privacy Policy

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

We may update this Privacy Policy as the service, laws, or business practices change. Updated versions will be posted on this page with a new effective date.`,
  },
  terms_of_service: {
    policyKey: "terms_of_service",
    version: "terms-2026-07-20",
    title: "Terms of Service",
    effectiveAt,
    supportEmail,
    legalEmail,
    content: `These Terms of Service ("Terms") govern access to and use of ZayOS, including its websites, dashboards, commerce workspaces, messaging integrations, APIs, and related services (together, the "Service"), operated by KME Solutions Company Limited ("ZayOS," "we," "us," or "our"). By creating an account, connecting a channel, or otherwise using the Service, you agree to these Terms on behalf of yourself and, if applicable, the business you represent.

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

If you have any questions about these Terms, please contact us at support@kme.com.mm.`,
  },
  data_deletion: {
    policyKey: "data_deletion",
    version: "data-deletion-2026-07-20",
    title: "Data Deletion",
    effectiveAt,
    supportEmail,
    legalEmail,
    content: `ZayOS Data Deletion Instructions

This page explains how users, merchants, customers, and integration platform reviewers can request deletion of data associated with ZayOS.

How to request deletion

Email support@kme.com.mm with the subject "Data Deletion Request". Include the email address used with ZayOS, the business or workspace name if applicable, the channel or integration involved, and a short description of the data you want deleted.

If you are a customer of a merchant that uses ZayOS, you may contact the merchant directly or email support@kme.com.mm. We may need to coordinate with the merchant workspace owner because the merchant controls customer records and business transaction data inside its workspace.

What we can delete

Depending on your request and your role, ZayOS can delete or anonymize account details, workspace user profiles, customer records, conversation content, uploaded media, integration identifiers, lead submissions, and related operational records that are no longer required to provide the service or satisfy legal obligations.

What may be retained

Some records may be retained where required for security, fraud prevention, tax, accounting, dispute resolution, legal compliance, backup integrity, audit logs, or enforcement of agreements. Retained records are limited to what is necessary for those purposes and are removed or anonymized when no longer required.

Third-party connected services

Deleting data from ZayOS may not delete data held by third-party platforms such as messaging networks, social channels, delivery providers, payment providers, analytics tools, or storage services. You may need to submit deletion requests directly to those providers under their own policies.

Verification and timing

We may ask for information to verify your identity, authority, or workspace ownership before acting on a deletion request. We aim to respond within 30 days unless a shorter or longer period is required or permitted by applicable law.

Questions

For privacy or deletion questions, contact support@kme.com.mm.`,
  },
}

export function getFallbackLegalPolicy(policyKey: PublicLegalPolicy["policyKey"]) {
  return fallbackLegalPolicies[policyKey]
}
