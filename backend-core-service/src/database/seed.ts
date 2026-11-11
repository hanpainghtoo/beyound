import 'reflect-metadata';
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- Legacy seed helpers accept dynamic repository data shapes; this task updates seeded webhook routes only. */
import * as bcrypt from 'bcryptjs';
import { ILike, Not, type Repository } from 'typeorm';

import { AppDataSource } from './data-source';
import { assertDemoSeedAllowed } from '../config/database-safety.util';
import { PlatformAdmin } from '../auth/entities/platform-admin.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { normalizeIdentityEmail } from '../auth/identity-email.util';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { ChannelTemplate } from '../channel/entities/channel-template.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { Customer } from '../customer/entities/customer.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { Message } from '../conversation/entities/message.entity';
import { ProductCategory } from '../product/entities/product-category.entity';
import { Product } from '../product/entities/product.entity';
import { Order } from '../order/entities/order.entity';
import type {
  DeliveryStatus,
  OrderStatus,
  PaymentStatus,
} from '../order/order-transition.service';
import { OrderItem } from '../order/entities/order-item.entity';
import { CannedResponse } from '../common/entities/canned-response.entity';
import { Notification } from '../common/entities/notification.entity';
import { TenantAnalytics } from '../analytics/entities/tenant-analytics.entity';
import { AgentAnalytics } from '../analytics/entities/agent-analytics.entity';
import { DomainEvent } from '../domain-event/entities/domain-event.entity';
import { PlatformSetting } from '../platform-admin/entities/platform-setting.entity';
import { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import { BillingAccount } from '../platform-admin/entities/billing-account.entity';
import { TenantUsageEvent } from '../usage/entities/tenant-usage-event.entity';
import { TenantEntitlement } from '../entitlement/entities/tenant-entitlement.entity';
import { TenantEntitlementEvent } from '../entitlement/entities/tenant-entitlement-event.entity';
import { TenantSubscriptionPeriod } from '../subscription-period/entities/tenant-subscription-period.entity';
import { SubscriptionPeriodEvent } from '../subscription-period/entities/subscription-period-event.entity';
import { buildQuotaSnapshot } from '../subscription-period/subscription-period.types';
import {
  yangonCalendarDate,
  yangonMonthStart,
  yangonNextMonthStart,
} from '../subscription-period/yangon-month.util';
import { LegalPolicy } from '../legal-policy/entities/legal-policy.entity';
import { FeatureCategory } from '../feature-toggle/entities/feature-category.entity';
import { TenantFeatureConfig } from '../feature-toggle/entities/tenant-feature-config.entity';

const DEMO_PASSWORD = 'Password123!';
const DEMO_SCENARIO_TITLE = 'Mingalar Mobile same-day phone sale';

async function saveBy<T extends object>(
  repository: Repository<T>,
  where: Partial<T>,
  data: Partial<T>,
): Promise<T> {
  const existing = await repository.findOne({ where: where as any });

  if (existing) {
    Object.assign(existing, data);
    return repository.save(existing as any) as Promise<T>;
  }

  const entity = repository.create(data as any) as T;
  return repository.save(entity as any) as Promise<T>;
}

async function saveByAny<T extends object>(
  repository: Repository<T>,
  whereOptions: Partial<T>[],
  data: Partial<T>,
): Promise<T> {
  const existing = await repository.findOne({ where: whereOptions as any });

  if (existing) {
    Object.assign(existing, data);
    return repository.save(existing as any) as Promise<T>;
  }

  const entity = repository.create(data as any) as T;
  return repository.save(entity as any) as Promise<T>;
}

function today(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function currentBillingPeriod(now = new Date()): {
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
} {
  return {
    billingPeriodStart: yangonMonthStart(now),
    billingPeriodEnd: yangonNextMonthStart(now),
  };
}

async function seed() {
  assertDemoSeedAllowed();
  await AppDataSource.initialize();

  const passwordHash = await bcrypt.hash(
    DEMO_PASSWORD,
    Number.parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
  );

  const platformAdminRepository = AppDataSource.getRepository(PlatformAdmin);
  const subscriptionPlanRepository =
    AppDataSource.getRepository(SubscriptionPlan);
  const tenantRepository = AppDataSource.getRepository(Tenant);
  const tenantUserRepository = AppDataSource.getRepository(TenantUser);
  const channelTemplateRepository =
    AppDataSource.getRepository(ChannelTemplate);
  const tenantChannelRepository = AppDataSource.getRepository(TenantChannel);
  const customerRepository = AppDataSource.getRepository(Customer);
  const conversationRepository = AppDataSource.getRepository(Conversation);
  const messageRepository = AppDataSource.getRepository(Message);
  const productCategoryRepository =
    AppDataSource.getRepository(ProductCategory);
  const productRepository = AppDataSource.getRepository(Product);
  const orderRepository = AppDataSource.getRepository(Order);
  const orderItemRepository = AppDataSource.getRepository(OrderItem);
  const cannedResponseRepository = AppDataSource.getRepository(CannedResponse);
  const notificationRepository = AppDataSource.getRepository(Notification);
  const tenantAnalyticsRepository =
    AppDataSource.getRepository(TenantAnalytics);
  const agentAnalyticsRepository = AppDataSource.getRepository(AgentAnalytics);
  const domainEventRepository = AppDataSource.getRepository(DomainEvent);
  const platformSettingRepository =
    AppDataSource.getRepository(PlatformSetting);
  const billingRecordRepository =
    AppDataSource.getRepository(TenantBillingRecord);
  const billingAccountRepository = AppDataSource.getRepository(BillingAccount);
  const usageEventRepository = AppDataSource.getRepository(TenantUsageEvent);
  const entitlementRepository = AppDataSource.getRepository(TenantEntitlement);
  const entitlementEventRepository = AppDataSource.getRepository(
    TenantEntitlementEvent,
  );
  const subscriptionPeriodRepository = AppDataSource.getRepository(
    TenantSubscriptionPeriod,
  );
  const subscriptionPeriodEventRepository = AppDataSource.getRepository(
    SubscriptionPeriodEvent,
  );
  const legalPolicyRepository = AppDataSource.getRepository(LegalPolicy);

  const platformAdmin = await saveBy(
    platformAdminRepository,
    { email: 'platform@kme.local' },
    {
      fullName: 'KME Platform Admin',
      email: 'platform@kme.local',
      passwordHash,
      role: 'super_admin',
      status: 'active',
      twoFactorEnabled: false,
    },
  );

  await Promise.all([
    saveBy(
      platformAdminRepository,
      { email: 'ops@kme.local' },
      {
        fullName: 'KME Operations Admin',
        email: 'ops@kme.local',
        passwordHash,
        role: 'ops_admin',
        status: 'active',
        twoFactorEnabled: false,
      },
    ),
    saveBy(
      platformAdminRepository,
      { email: 'it@kme.local' },
      {
        fullName: 'KME IT Admin',
        email: 'it@kme.local',
        passwordHash,
        role: 'it_admin',
        status: 'active',
        twoFactorEnabled: false,
      },
    ),
    saveBy(
      platformAdminRepository,
      { email: 'finance-viewer@kme.local' },
      {
        fullName: 'KME Finance Viewer',
        email: 'finance-viewer@kme.local',
        passwordHash,
        role: 'finance_viewer',
        status: 'active',
        twoFactorEnabled: false,
      },
    ),
    saveBy(
      platformAdminRepository,
      { email: 'support-viewer@kme.local' },
      {
        fullName: 'KME Support Viewer',
        email: 'support-viewer@kme.local',
        passwordHash,
        role: 'support_viewer',
        status: 'active',
        twoFactorEnabled: false,
      },
    ),
    saveBy(
      platformAdminRepository,
      { email: 'readonly@kme.local' },
      {
        fullName: 'KME Read Only Viewer',
        email: 'readonly@kme.local',
        passwordHash,
        role: 'read_only',
        status: 'active',
        twoFactorEnabled: false,
      },
    ),
  ]);

  const guidedPilotPlan = await saveBy(
    subscriptionPlanRepository,
    { name: 'Guided Pilot' },
    {
      name: 'Guided Pilot',
      description:
        'Guided pilot workspace for validating one real commerce workflow before full rollout.',
      monthlyPrice: 300000,
      durationDays: 7,
      messageQuotaMode: 'combined',
      maxAgents: 3,
      maxChannels: 1,
      messageLimit: 5000,
      inboundMessageLimit: 4000,
      outboundMessageLimit: 1000,
      allowedProviders: ['messenger', 'telegram'],
      storageLimitGb: 5,
      status: 'active',
      features: {
        inbox: true,
        orders: true,
        analytics: true,
        cannedResponses: true,
        public: {
          visible: true,
          displayOrder: 1,
          eyebrow: 'Best for pilot teams',
          summary:
            'Test ZayOS using a real sales workflow before moving to a full subscription.',
          targetCustomer:
            'Small teams validating one real workflow before a broader rollout.',
          recommended: false,
          selfServe: false,
          ctaLabel: 'Request Guided Pilot',
          ctaHref:
            '/contact?intent=sales&source=pricing&package=Guided%20Pilot',
          currencyCode: 'MMK',
          billingInterval: 'monthly',
          monthlyPriceLabel: '300,000 MMK / month',
          setupFeeMmk: 0,
          setupFeeLabel: 'No separate setup fee',
          includedUsersLabel: 'Up to 3 team members',
          includedChannelsLabel: '1 supported sales channel',
          featureList: [
            'One ZayOS workspace',
            'Unified inbox',
            'Customer and product records',
            'Order creation',
            'Payment and COD tracking',
            'Delivery follow-up',
            'Initial product-data assistance',
            'Remote team training',
          ],
          availability: 'enabled',
        },
      },
    },
  );

  const businessLaunchPlan = await saveBy(
    subscriptionPlanRepository,
    { name: 'Business Launch' },
    {
      name: 'Business Launch',
      description: 'Primary production package for growing commerce teams.',
      monthlyPrice: 500000,
      durationDays: 14,
      messageQuotaMode: 'combined',
      maxAgents: 5,
      maxChannels: 2,
      messageLimit: 20000,
      inboundMessageLimit: 16000,
      outboundMessageLimit: 4000,
      allowedProviders: ['messenger', 'telegram'],
      storageLimitGb: 10,
      status: 'active',
      features: {
        inbox: true,
        orders: true,
        analytics: true,
        cannedResponses: true,
        public: {
          visible: true,
          displayOrder: 2,
          eyebrow: 'Recommended package',
          summary:
            'For growing online shops and commerce teams that need one organized workflow from customer conversation to completed delivery.',
          targetCustomer:
            'Growing commerce teams that want a structured production rollout.',
          recommended: true,
          recommendationLabel: 'Recommended for most growing commerce teams',
          selfServe: false,
          ctaLabel: 'Request Business Launch',
          ctaHref:
            '/contact?intent=sales&source=pricing&package=Business%20Launch',
          currencyCode: 'MMK',
          billingInterval: 'monthly',
          setupFeeMmk: 1000000,
          setupFeeLabel: 'Setup and onboarding',
          includedUsersLabel: 'Up to 5 team members',
          includedChannelsLabel: 'Up to 2 supported channels',
          featureList: [
            'One production workspace',
            'Unified team inbox',
            'Conversation assignment and follow-up',
            'Saved replies and media',
            'Product management',
            'Customer profiles and history',
            'Order management',
            'Standard business-hours support',
          ],
          availability: 'enabled',
        },
      },
    },
  );

  const businessGrowthPlan = await saveBy(
    subscriptionPlanRepository,
    { name: 'Business Growth' },
    {
      name: 'Business Growth',
      description:
        'Broader rollout package for established brands and larger teams.',
      monthlyPrice: 1000000,
      durationDays: 30,
      messageQuotaMode: 'combined',
      maxAgents: 15,
      maxChannels: 4,
      messageLimit: 50000,
      inboundMessageLimit: 40000,
      outboundMessageLimit: 10000,
      allowedProviders: ['messenger', 'telegram', 'viber'],
      storageLimitGb: 25,
      status: 'active',
      features: {
        inbox: true,
        orders: true,
        analytics: true,
        cannedResponses: true,
        public: {
          visible: true,
          displayOrder: 3,
          eyebrow: 'For larger operations',
          summary:
            'For established online brands, livestream sellers, and larger teams managing higher conversation and order volumes.',
          targetCustomer:
            'Larger teams that need broader rollout support and management visibility.',
          recommended: false,
          selfServe: false,
          ctaLabel: 'Request Growth Proposal',
          ctaHref:
            '/contact?intent=sales&source=pricing&package=Business%20Growth',
          currencyCode: 'MMK',
          billingInterval: 'monthly',
          setupFeeMmk: 2000000,
          setupFeeLabel: 'Implementation',
          setupFeeStartsFrom: true,
          includedUsersLabel: 'Up to 15 team members',
          includedChannelsLabel: 'Up to 4 supported channels',
          featureList: [
            'Everything in Business Launch',
            'Higher workspace usage allowances',
            'Manager and management controls',
            'Advanced business reports',
            'Extended data-import assistance',
            'Workflow review and configuration',
            'Priority onboarding',
            'Priority business-hours support',
          ],
          availability: 'enabled',
        },
      },
    },
  );

  const enterprisePlan = await saveBy(
    subscriptionPlanRepository,
    { name: 'Enterprise' },
    {
      name: 'Enterprise',
      description:
        'Custom commercial scope for larger organizations and tailored workflows.',
      monthlyPrice: 0,
      durationDays: 30,
      messageQuotaMode: 'combined',
      maxAgents: 50,
      maxChannels: 10,
      // Phase 0 decision (2026-08-05): directional limits derive from the
      // aggregate message_limit with an explicit conversion record when they
      // are missing (both 0) while message_limit is non-zero.
      messageLimit: 100000,
      inboundMessageLimit: 100000,
      outboundMessageLimit: 100000,
      allowedProviders: ['messenger', 'telegram', 'viber', 'tiktok'],
      storageLimitGb: 50,
      status: 'active',
      features: {
        inbox: true,
        orders: true,
        analytics: true,
        cannedResponses: true,
        public: {
          visible: true,
          displayOrder: 4,
          eyebrow: 'Custom rollout',
          summary:
            'For larger organizations requiring multiple brands, custom reporting, or tailored operational workflows.',
          targetCustomer:
            'Organizations with complex operating requirements across brands or systems.',
          recommended: false,
          selfServe: false,
          ctaLabel: 'Request Enterprise',
          ctaHref: '/contact?intent=sales&source=pricing&package=Enterprise',
          currencyCode: 'MMK',
          billingInterval: 'custom',
          monthlyPriceLabel: 'Custom proposal',
          setupFeeLabel: 'Implementation scope',
          includedUsersLabel: 'Larger team access',
          includedChannelsLabel: 'Custom channel scope',
          featureList: [
            'Multiple workspaces or brands',
            'Custom reporting',
            'Delivery-service integrations',
            'Payment integrations',
            'Existing-system integration',
            'Data migration',
            'Dedicated implementation planning',
            'Onsite workshops and training',
          ],
          availability: 'contact-only',
        },
      },
    },
  );

  // Plan 53: demo unlimited-capacity plan. Existing seed plans stay finite;
  // this row exercises null (unlimited) outbound/channels/storage/seats with
  // a finite 10000 inbound quota. Price is a demo placeholder.
  const unlimitedPilotPlan = await saveBy(
    subscriptionPlanRepository,
    { name: 'Unlimited Pilot' },
    {
      name: 'Unlimited Pilot',
      description:
        'Demo unlimited-capacity package for high-volume teams: unlimited outbound messages, channels, storage, and seats with a 10000 inbound message quota.',
      monthlyPrice: 800000,
      durationDays: 30,
      messageQuotaMode: 'combined',
      maxAgents: null,
      maxChannels: null,
      messageLimit: null,
      inboundMessageLimit: 10000,
      outboundMessageLimit: null,
      allowedProviders: ['messenger', 'telegram'],
      storageLimitGb: null,
      status: 'active',
      features: {
        inbox: true,
        orders: true,
        analytics: true,
        cannedResponses: true,
        public: {
          visible: true,
          displayOrder: 5,
          eyebrow: 'Unlimited capacity',
          summary:
            'For high-volume teams that need unlimited outbound messages, channels, storage, and seats.',
          targetCustomer:
            'Teams with unpredictable or spiky usage that prefer no capacity caps.',
          recommended: false,
          selfServe: false,
          ctaLabel: 'Request Unlimited Pilot',
          ctaHref:
            '/contact?intent=sales&source=pricing&package=Unlimited%20Pilot',
          currencyCode: 'MMK',
          billingInterval: 'monthly',
          includedUsersLabel: 'Unlimited team members',
          includedChannelsLabel: 'Unlimited channels',
          featureList: [
            'Unlimited outbound messages',
            'Unlimited channels',
            'Unlimited storage',
            'Unlimited team seats',
            '10000 inbound messages per month',
          ],
          availability: 'enabled',
        },
      },
    },
  );

  // Plan 14 Phase 7 (task 7.1): exactly one active trial plan. New
  // self-service workspaces are auto-provisioned against this plan, so the
  // seed must always produce a single valid trial configuration. Trial plans
  // are one-time, auto-approved, non-renewable, non-requestable, and
  // top-up-ineligible (all enforced server-side too).
  const trialPlan = await saveBy(
    subscriptionPlanRepository,
    { name: 'ZayOS Trial' },
    {
      name: 'ZayOS Trial',
      description:
        'Auto-provisioned one-time trial for new workspaces before choosing a business plan.',
      planType: 'trial',
      monthlyPrice: 0,
      durationDays: 7,
      requestable: false,
      renewable: false,
      topUpAllowed: false,
      autoApprove: true,
      messageQuotaMode: 'combined',
      maxAgents: 3,
      maxChannels: 1,
      messageLimit: 1000,
      inboundMessageLimit: 1000,
      outboundMessageLimit: 1000,
      allowedProviders: ['messenger', 'telegram'],
      storageLimitGb: 1,
      status: 'active',
      features: {
        inbox: true,
        orders: true,
        analytics: true,
        cannedResponses: true,
      },
    },
  );

  void trialPlan;
  void unlimitedPilotPlan;
  void guidedPilotPlan;
  void businessGrowthPlan;
  void enterprisePlan;

  await Promise.all([
    saveBy(
      legalPolicyRepository,
      { policyKey: 'terms_of_service', version: '1.0' },
      {
        policyKey: 'terms_of_service',
        version: '1.0',
        status: 'published',
        title: 'Terms of Service',
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
        contentFormat: 'markdown',
        effectiveAt: new Date('2026-07-20T00:00:00.000Z'),
        publishedAt: new Date('2026-07-20T00:00:00.000Z'),
        publishedById: null,
        supportEmail: 'support@kme.com.mm',
        legalEmail: '',
      },
    ),
    saveBy(
      legalPolicyRepository,
      { policyKey: 'privacy_policy', version: 'privacy-2026-07-20' },
      {
        policyKey: 'privacy_policy',
        version: 'privacy-2026-07-20',
        status: 'published',
        title: 'Privacy Policy',
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
        contentFormat: 'markdown',
        effectiveAt: new Date('2026-07-20T00:00:00.000Z'),
        publishedAt: new Date('2026-07-20T00:00:00.000Z'),
        publishedById: null,
        supportEmail: 'support@kme.com.mm',
        legalEmail: '',
      },
    ),
  ]);

  await legalPolicyRepository.update(
    {
      policyKey: 'privacy_policy',
      version: Not('privacy-2026-07-20'),
      status: 'published',
      content: ILike('%content coming soon%'),
    },
    { status: 'retired' },
  );

  const seedNow = new Date();
  const subscriptionStartDate = yangonMonthStart(seedNow);
  const subscriptionEndDate = yangonNextMonthStart(seedNow);

  // Plan 55: feature toggle catalog + demo tenant rows (all enabled).
  const featureCatalog: Partial<FeatureCategory>[] = [
    {
      key: 'inbox',
      displayName: 'Inbox & Chat',
      description: 'Shared inbox and team chat. Always available.',
      dependsOn: null,
      isLockable: false,
      displayOrder: 10,
    },
    {
      key: 'orders',
      displayName: 'Orders',
      description: 'Order capture, order pipeline and order settings.',
      dependsOn: null,
      isLockable: true,
      displayOrder: 20,
    },
    {
      key: 'deliveries',
      displayName: 'Deliveries',
      description: 'Delivery runs and delivery assignments. Requires Orders.',
      dependsOn: 'orders',
      isLockable: true,
      displayOrder: 30,
    },
    {
      key: 'products',
      displayName: 'Products',
      description: 'Product and catalog management.',
      dependsOn: null,
      isLockable: true,
      displayOrder: 40,
    },
    {
      key: 'customers',
      displayName: 'Customers',
      description: 'Customer records and profiles.',
      dependsOn: null,
      isLockable: true,
      displayOrder: 50,
    },
    {
      key: 'reports',
      displayName: 'Reports',
      description: 'Commerce and messaging reporting.',
      dependsOn: null,
      isLockable: true,
      displayOrder: 60,
    },
  ];
  const featureCategoryRepository =
    AppDataSource.getRepository(FeatureCategory);
  const seededCategories: FeatureCategory[] = [];
  for (const entry of featureCatalog) {
    seededCategories.push(
      await saveBy<FeatureCategory>(
        featureCategoryRepository,
        { key: entry.key! },
        entry,
      ),
    );
  }

  const tenant = await saveBy(
    tenantRepository,
    { tenantCode: 'KME-DEMO' },
    {
      tenantCode: 'KME-DEMO',
      companyName: 'Mingalar Mobile',
      industry: 'Retail',
      businessType: 'Mobile phone retailer',
      contactPerson: 'Daw Thandar Aye',
      contactEmail: 'admin@demo.local',
      contactPhone: '+95 9 400 000 001',
      website: 'https://mingalar-mobile.demo.local',
      address: 'Bahan Township, Yangon, Myanmar',
      description:
        'Demo tenant for a mobile retailer using zayos support, product sales, and order follow-up.',
      status: 'active',
      subscriptionPlanId: businessLaunchPlan.id,
      subscriptionStartDate,
      subscriptionEndDate,
      timezone: 'Asia/Yangon',
      language: 'en',
      featureFlags: {
        ai: false,
        orderLifecycle: true,
        customerTimeline: true,
      },
      aiSettings: {
        enabled: false,
        provider: 'noop',
      },
      approvedAt: new Date(),
      approvedBy: platformAdmin.id,
    },
  );

  // Plan 55: demo tenant starts with every feature toggle enabled.
  const tenantFeatureConfigRepository =
    AppDataSource.getRepository(TenantFeatureConfig);
  for (const category of seededCategories) {
    await saveBy<TenantFeatureConfig>(
      tenantFeatureConfigRepository,
      { tenantId: tenant.id, featureCategoryId: category.id },
      { tenantId: tenant.id, featureCategoryId: category.id, isEnabled: true },
    );
  }

  const entitlement = await saveBy(
    entitlementRepository,
    { tenantId: tenant.id },
    {
      tenantId: tenant.id,
      planId: businessLaunchPlan.id,
      state: 'paid_active',
      trialStartsAt: null,
      trialEndsAt: null,
      graceEndsAt: null,
      paidPeriodStartsAt: subscriptionStartDate,
      paidPeriodEndsAt: subscriptionEndDate,
      suspendedAt: null,
      suspensionReason: null,
      cancelledAt: null,
      cancellationReason: null,
      reactivationRequestedAt: null,
      reactivationEvidence: {},
    },
  );

  await saveBy(
    entitlementEventRepository,
    { idempotencyKey: `seed:tenant-entitlement:${tenant.id}` },
    {
      entitlementId: entitlement.id,
      tenantId: tenant.id,
      previousState: null,
      newState: 'paid_active',
      actorType: 'system',
      actorId: 'seed',
      source: 'system',
      reason: 'Seeded demo tenant production entitlement',
      idempotencyKey: `seed:tenant-entitlement:${tenant.id}`,
      metadata: { scenario: DEMO_SCENARIO_TITLE },
    },
  );

  const tenantOwner = await saveBy(
    tenantUserRepository,
    { normalizedEmail: normalizeIdentityEmail('owner@demo.local') },
    {
      tenantId: tenant.id,
      fullName: 'Daw Thandar Aye',
      firstName: 'Thandar',
      lastName: 'Aye',
      email: 'owner@demo.local',
      normalizedEmail: normalizeIdentityEmail('owner@demo.local'),
      passwordHash,
      phone: '+95 9 400 000 100',
      role: 'owner',
      status: 'active',
      emailVerifiedAt: new Date(),
      isOnline: true,
      department: 'Executive',
      employeeId: 'OWN-001',
      hireDate: new Date('2024-01-01'),
      permissions: { all: true },
      notificationPreferences: { email: true, inApp: true },
    },
  );

  const tenantAdmin = await saveBy(
    tenantUserRepository,
    { normalizedEmail: normalizeIdentityEmail('admin@demo.local') },
    {
      tenantId: tenant.id,
      fullName: 'Thandar Aye',
      firstName: 'Thandar',
      lastName: 'Aye',
      email: 'admin@demo.local',
      normalizedEmail: normalizeIdentityEmail('admin@demo.local'),
      passwordHash,
      phone: '+95 9 400 000 101',
      role: 'admin',
      status: 'active',
      emailVerifiedAt: new Date(),
      isOnline: true,
      department: 'Operations',
      employeeId: 'ADM-001',
      hireDate: new Date('2024-01-15'),
      permissions: { all: true },
      notificationPreferences: { email: true, inApp: true },
    },
  );

  const supervisor = await saveBy(
    tenantUserRepository,
    { normalizedEmail: normalizeIdentityEmail('supervisor@demo.local') },
    {
      tenantId: tenant.id,
      fullName: 'Kyaw Min Thu',
      firstName: 'Kyaw Min',
      lastName: 'Thu',
      email: 'supervisor@demo.local',
      normalizedEmail: normalizeIdentityEmail('supervisor@demo.local'),
      passwordHash,
      phone: '+95 9 400 000 102',
      role: 'supervisor',
      status: 'active',
      emailVerifiedAt: new Date(),
      isOnline: true,
      department: 'Customer Support',
      employeeId: 'SUP-001',
      hireDate: new Date('2024-02-01'),
      permissions: { teamManagement: true, reports: true },
      notificationPreferences: { email: true, inApp: true },
    },
  );

  const financeUser = await saveBy(
    tenantUserRepository,
    { normalizedEmail: normalizeIdentityEmail('finance@demo.local') },
    {
      tenantId: tenant.id,
      fullName: 'May Thu Zar',
      firstName: 'May Thu',
      lastName: 'Zar',
      email: 'finance@demo.local',
      normalizedEmail: normalizeIdentityEmail('finance@demo.local'),
      passwordHash,
      phone: '+95 9 400 000 103',
      role: 'finance',
      status: 'active',
      emailVerifiedAt: new Date(),
      isOnline: false,
      department: 'Finance',
      employeeId: 'FIN-001',
      hireDate: new Date('2024-03-01'),
      permissions: { billing: true, payments: true, orders: true },
      notificationPreferences: { email: true, inApp: true },
    },
  );

  const deliveryUser = await saveBy(
    tenantUserRepository,
    { normalizedEmail: normalizeIdentityEmail('delivery@demo.local') },
    {
      tenantId: tenant.id,
      fullName: 'Ko Min Zaw',
      firstName: 'Ko Min',
      lastName: 'Zaw',
      email: 'delivery@demo.local',
      normalizedEmail: normalizeIdentityEmail('delivery@demo.local'),
      passwordHash,
      phone: '+95 9 400 000 104',
      role: 'delivery',
      status: 'active',
      emailVerifiedAt: new Date(),
      isOnline: true,
      department: 'Delivery',
      employeeId: 'DLV-001',
      hireDate: new Date('2024-03-15'),
      permissions: { deliveries: true, orders: true },
      notificationPreferences: { email: false, inApp: true },
    },
  );

  await saveBy(
    channelTemplateRepository,
    { channelType: 'messenger', templateName: 'Messenger Basic' },
    {
      channelType: 'messenger',
      templateName: 'Messenger Basic',
      appId: 'demo-messenger-app',
      callbackUrl: 'http://localhost:3003/webhooks/messenger',
      webhookEvents: ['messages', 'messaging_postbacks'],
      defaultWelcomeMessage:
        'Welcome to Mingalar Mobile. Which phone or delivery update can we help with?',
      status: 'active',
      configuration: { provider: 'facebook' },
    },
  );

  await saveBy(
    channelTemplateRepository,
    { channelType: 'telegram', templateName: 'Telegram Basic' },
    {
      channelType: 'telegram',
      templateName: 'Telegram Basic',
      botToken: 'demo-token',
      callbackUrl: 'http://localhost:3003/webhooks/telegram',
      webhookEvents: ['message'],
      defaultWelcomeMessage: 'Welcome to Mingalar Mobile.',
      status: 'active',
      configuration: { provider: 'telegram' },
    },
  );

  const messengerChannel = await saveByAny(
    tenantChannelRepository,
    [
      { tenantId: tenant.id, channelName: 'KME Demo Messenger' },
      { tenantId: tenant.id, channelName: 'Mingalar Mobile Messenger' },
    ],
    {
      tenantId: tenant.id,
      channelType: 'messenger',
      channelName: 'Mingalar Mobile Messenger',
      displayName: 'Mingalar Mobile',
      status: 'active',
      configuration: { pageId: 'demo-page' },
      credentials: { appId: 'demo-messenger-app' },
      webhookRegistrationStatus: 'pending',
      welcomeMessage: 'Hi, welcome to Mingalar Mobile.',
      autoReplyEnabled: true,
      autoReplyMessage: 'Thanks for messaging us. Our team will reply shortly.',
      assignmentRule: 'round_robin',
      businessHours: { timezone: 'Asia/Yangon', weekdays: '09:00-18:00' },
      notificationSettings: { newMessage: true },
      lastSyncAt: new Date(),
    },
  );

  const telegramChannel = await saveByAny(
    tenantChannelRepository,
    [
      { tenantId: tenant.id, channelName: 'KME Demo Telegram' },
      { tenantId: tenant.id, channelName: 'Mingalar Mobile Telegram' },
    ],
    {
      tenantId: tenant.id,
      channelType: 'telegram',
      channelName: 'Mingalar Mobile Telegram',
      displayName: 'Mingalar Mobile Telegram',
      status: 'active',
      configuration: { botUsername: 'kme_demo_bot' },
      credentials: { botToken: 'demo-token' },
      webhookRegistrationStatus: 'pending',
      welcomeMessage: 'Hi, welcome to Mingalar Mobile.',
      autoReplyEnabled: false,
      assignmentRule: 'least_busy',
      businessHours: { timezone: 'Asia/Yangon', weekdays: '09:00-18:00' },
      notificationSettings: { newMessage: true },
      lastSyncAt: new Date(),
    },
  );

  messengerChannel.webhookUrl = `http://localhost:3003/webhooks/messenger/shared`;
  messengerChannel.configuration = {
    ...(messengerChannel.configuration || {}),
    webhookUrl: messengerChannel.webhookUrl,
  };
  await tenantChannelRepository.save(messengerChannel);

  telegramChannel.webhookUrl = `http://localhost:3003/webhooks/telegram/${telegramChannel.id}`;
  telegramChannel.configuration = {
    ...(telegramChannel.configuration || {}),
    webhookUrl: telegramChannel.webhookUrl,
  };
  await tenantChannelRepository.save(telegramChannel);

  const category = await saveByAny(
    productCategoryRepository,
    [
      { tenantId: tenant.id, name: 'Electronics' },
      { tenantId: tenant.id, name: 'Mobile Phones' },
    ],
    {
      tenantId: tenant.id,
      name: 'Mobile Phones',
      description: 'Phones and setup services sold by Mingalar Mobile',
      sortOrder: 1,
      isActive: true,
    },
  );

  const phoneProduct = await saveByAny(
    productRepository,
    [
      { tenantId: tenant.id, sku: 'DEMO-PHONE-001' },
      { tenantId: tenant.id, sku: 'MM-PHONE-001' },
    ],
    {
      tenantId: tenant.id,
      categoryId: category.id,
      name: 'Mingalar X1 Smartphone',
      sku: 'MM-PHONE-001',
      type: 'product',
      description: 'Main phone model used in the demo purchase conversation.',
      shortDescription: '128GB smartphone',
      price: 450000,
      costPrice: 375000,
      stockQuantity: 25,
      lowStockThreshold: 5,
      trackInventory: true,
      images: [],
      tags: ['phone', 'best-seller'],
      status: 'active',
      isFeatured: true,
    },
  );

  const supportProduct = await saveByAny(
    productRepository,
    [
      { tenantId: tenant.id, sku: 'DEMO-SERVICE-001' },
      { tenantId: tenant.id, sku: 'MM-SETUP-001' },
    ],
    {
      tenantId: tenant.id,
      categoryId: category.id,
      name: 'Phone Setup Service',
      sku: 'MM-SETUP-001',
      type: 'service',
      description:
        'SIM, account, and app setup service added during the chat order.',
      shortDescription: 'Phone setup',
      price: 50000,
      stockQuantity: 999,
      trackInventory: false,
      images: [],
      tags: ['setup', 'service'],
      status: 'active',
    },
  );

  const accessoryCategory = await saveBy(
    productCategoryRepository,
    { tenantId: tenant.id, name: 'Accessories' },
    {
      tenantId: tenant.id,
      name: 'Accessories',
      description: 'Chargers, cases, and bundle add-ons used by demo orders',
      sortOrder: 2,
      isActive: true,
    },
  );

  const accessoryProducts = await Promise.all([
    saveBy(
      productRepository,
      { tenantId: tenant.id, sku: 'MM-CASE-001' },
      {
        tenantId: tenant.id,
        categoryId: accessoryCategory.id,
        name: 'Clear Protection Case',
        sku: 'MM-CASE-001',
        type: 'product',
        description: 'Transparent case commonly bundled with phone purchases.',
        shortDescription: 'Clear phone case',
        price: 18000,
        costPrice: 9000,
        stockQuantity: 8,
        lowStockThreshold: 10,
        trackInventory: true,
        images: [],
        tags: ['accessory', 'low-stock'],
        status: 'active',
        isFeatured: false,
      },
    ),
    saveBy(
      productRepository,
      { tenantId: tenant.id, sku: 'MM-CHARGER-001' },
      {
        tenantId: tenant.id,
        categoryId: accessoryCategory.id,
        name: 'Fast Charger 30W',
        sku: 'MM-CHARGER-001',
        type: 'product',
        description: 'USB-C fast charger for phone bundles.',
        shortDescription: '30W charger',
        price: 35000,
        costPrice: 21000,
        stockQuantity: 0,
        lowStockThreshold: 5,
        trackInventory: true,
        images: [],
        tags: ['accessory', 'out-of-stock'],
        status: 'out_of_stock',
      },
    ),
    saveBy(
      productRepository,
      { tenantId: tenant.id, sku: 'MM-WARRANTY-001' },
      {
        tenantId: tenant.id,
        categoryId: accessoryCategory.id,
        name: 'Extended Warranty',
        sku: 'MM-WARRANTY-001',
        type: 'service',
        description: 'Optional twelve-month warranty extension.',
        shortDescription: 'Warranty add-on',
        price: 65000,
        stockQuantity: 999,
        trackInventory: false,
        images: [],
        tags: ['service', 'warranty'],
        status: 'inactive',
      },
    ),
  ]);

  const customer = await saveBy(
    customerRepository,
    { tenantId: tenant.id, externalId: 'messenger-customer-001' },
    {
      tenantId: tenant.id,
      externalId: 'messenger-customer-001',
      channelId: messengerChannel.id,
      fullName: 'Ko Zaw Zaw',
      email: 'zawzaw@example.local',
      phone: '+95 9 400 000 201',
      language: 'en',
      timezone: 'Asia/Yangon',
      location: { city: 'Yangon', country: 'Myanmar' },
      profileData: { source: 'messenger', scenario: DEMO_SCENARIO_TITLE },
      tags: ['vip', 'ready-to-buy'],
      notes:
        'Asked about same-day phone availability and completed a paid order.',
      status: 'active',
      firstContactAt: new Date(),
      lastContactAt: new Date(),
      totalConversations: 2,
    },
  );

  const telegramCustomer = await saveBy(
    customerRepository,
    { tenantId: tenant.id, externalId: 'telegram-customer-001' },
    {
      tenantId: tenant.id,
      externalId: 'telegram-customer-001',
      channelId: telegramChannel.id,
      fullName: 'Ma Hnin Ei',
      phone: '+95 9 400 000 202',
      language: 'en',
      timezone: 'Asia/Yangon',
      profileData: { source: 'telegram', scenario: DEMO_SCENARIO_TITLE },
      tags: ['delivery-follow-up'],
      status: 'active',
      firstContactAt: new Date(),
      lastContactAt: new Date(),
      totalConversations: 1,
    },
  );

  const scenarioCustomers = await Promise.all([
    saveBy(
      customerRepository,
      { tenantId: tenant.id, externalId: 'messenger-customer-002' },
      {
        tenantId: tenant.id,
        externalId: 'messenger-customer-002',
        channelId: messengerChannel.id,
        fullName: 'Nandar Win',
        email: 'nandar@example.local',
        phone: '+95 9 400 000 203',
        language: 'en',
        timezone: 'Asia/Yangon',
        location: { city: 'Mandalay', country: 'Myanmar' },
        profileData: { source: 'messenger', persona: 'price-sensitive buyer' },
        tags: ['discount-request'],
        notes: 'Asked for bulk discount and charger availability.',
        status: 'active',
        firstContactAt: new Date(),
        lastContactAt: new Date(),
        totalConversations: 1,
      },
    ),
    saveBy(
      customerRepository,
      { tenantId: tenant.id, externalId: 'messenger-customer-003' },
      {
        tenantId: tenant.id,
        externalId: 'messenger-customer-003',
        channelId: messengerChannel.id,
        fullName: 'Aung Myo',
        email: 'aungmyo@example.local',
        phone: '+95 9 400 000 204',
        language: 'en',
        timezone: 'Asia/Yangon',
        location: { city: 'Naypyidaw', country: 'Myanmar' },
        profileData: { source: 'messenger', persona: 'return scenario' },
        tags: ['return', 'follow-up'],
        notes: 'Returned a charger bundle and needs support follow-up.',
        status: 'active',
        firstContactAt: new Date(),
        lastContactAt: new Date(),
        totalConversations: 2,
      },
    ),
    saveBy(
      customerRepository,
      { tenantId: tenant.id, externalId: 'telegram-customer-002' },
      {
        tenantId: tenant.id,
        externalId: 'telegram-customer-002',
        channelId: telegramChannel.id,
        fullName: 'Thiha Aye',
        phone: '+95 9 400 000 205',
        language: 'en',
        timezone: 'Asia/Yangon',
        location: { city: 'Yangon', country: 'Myanmar' },
        profileData: { source: 'telegram', persona: 'payment issue' },
        tags: ['payment-issue'],
        notes: 'Payment transfer screenshot pending review.',
        status: 'active',
        firstContactAt: new Date(),
        lastContactAt: new Date(),
        totalConversations: 1,
      },
    ),
  ]);

  const openConversation = await saveBy(
    conversationRepository,
    { tenantId: tenant.id, conversationId: 'demo-conv-open-001' },
    {
      tenantId: tenant.id,
      customerId: customer.id,
      channelId: messengerChannel.id,
      assignedAgentId: supervisor.id,
      assignedAt: new Date(),
      conversationId: 'demo-conv-open-001',
      subject: 'Same-day Mingalar X1 purchase',
      status: 'open',
      priority: 'normal',
      tags: ['sales', 'same-day-delivery'],
      metadata: {
        source: 'seed',
        scenario: DEMO_SCENARIO_TITLE,
        expectedAction: 'Workspace team confirms stock and creates order',
      },
      firstMessageAt: new Date(),
      lastMessageAt: new Date(),
      lastCustomerMessageAt: new Date(),
      lastAgentResponseAt: new Date(),
      firstResponseAt: new Date(),
      slaDueAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  );

  const pendingConversation = await saveBy(
    conversationRepository,
    { tenantId: tenant.id, conversationId: 'demo-conv-pending-001' },
    {
      tenantId: tenant.id,
      customerId: telegramCustomer.id,
      channelId: telegramChannel.id,
      assignedAgentId: deliveryUser.id,
      assignedAt: new Date(),
      conversationId: 'demo-conv-pending-001',
      subject: 'Delivery update for phone order',
      status: 'pending',
      priority: 'high',
      tags: ['delivery'],
      metadata: {
        source: 'seed',
        scenario: DEMO_SCENARIO_TITLE,
        expectedAction: 'Delivery teammate checks delivery status',
      },
      firstMessageAt: new Date(),
      lastMessageAt: new Date(),
      lastCustomerMessageAt: new Date(),
      slaDueAt: new Date(Date.now() - 15 * 60 * 1000),
    },
  );

  const resolvedConversation = await saveBy(
    conversationRepository,
    { tenantId: tenant.id, conversationId: 'demo-conv-resolved-001' },
    {
      tenantId: tenant.id,
      customerId: customer.id,
      channelId: messengerChannel.id,
      assignedAgentId: supervisor.id,
      assignedAt: new Date(),
      conversationId: 'demo-conv-resolved-001',
      subject: 'Completed setup service after delivery',
      status: 'resolved',
      priority: 'normal',
      tags: ['service', 'resolved'],
      metadata: { source: 'seed', scenario: DEMO_SCENARIO_TITLE },
      firstMessageAt: new Date(),
      lastMessageAt: new Date(),
      resolvedAt: new Date(),
      lastCustomerMessageAt: new Date(),
      lastAgentResponseAt: new Date(),
      firstResponseAt: new Date(),
      resolutionTimeSeconds: 1800,
      customerSatisfactionRating: 5,
      customerFeedback: 'Phone setup was fast and clear.',
    },
  );

  const scenarioConversations = await Promise.all([
    saveBy(
      conversationRepository,
      { tenantId: tenant.id, conversationId: 'demo-conv-unassigned-001' },
      {
        tenantId: tenant.id,
        customerId: scenarioCustomers[0].id,
        channelId: messengerChannel.id,
        conversationId: 'demo-conv-unassigned-001',
        subject: 'Bulk accessory discount request',
        status: 'open',
        priority: 'normal',
        tags: ['discount', 'accessory'],
        metadata: {
          source: 'seed',
          expectedAction: 'Assign and quote accessory bundle',
        },
        firstMessageAt: new Date(),
        lastMessageAt: new Date(),
        lastCustomerMessageAt: new Date(),
        slaDueAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    ),
    saveBy(
      conversationRepository,
      { tenantId: tenant.id, conversationId: 'demo-conv-return-001' },
      {
        tenantId: tenant.id,
        customerId: scenarioCustomers[1].id,
        channelId: messengerChannel.id,
        assignedAgentId: supervisor.id,
        assignedAt: new Date(),
        conversationId: 'demo-conv-return-001',
        subject: 'Return request for charger bundle',
        status: 'pending',
        priority: 'high',
        tags: ['return', 'needs-review'],
        metadata: {
          source: 'seed',
          expectedAction: 'Review returned order and update lifecycle',
        },
        firstMessageAt: new Date(),
        lastMessageAt: new Date(),
        lastCustomerMessageAt: new Date(),
        slaDueAt: new Date(Date.now() + 25 * 60 * 1000),
      },
    ),
    saveBy(
      conversationRepository,
      { tenantId: tenant.id, conversationId: 'demo-conv-payment-001' },
      {
        tenantId: tenant.id,
        customerId: scenarioCustomers[2].id,
        channelId: telegramChannel.id,
        assignedAgentId: financeUser.id,
        assignedAt: new Date(),
        conversationId: 'demo-conv-payment-001',
        subject: 'Bank transfer payment review',
        status: 'open',
        priority: 'urgent',
        tags: ['payment', 'bank-transfer'],
        metadata: {
          source: 'seed',
          expectedAction:
            'Finance teammate checks payment status and updates the order',
        },
        firstMessageAt: new Date(),
        lastMessageAt: new Date(),
        lastCustomerMessageAt: new Date(),
        slaDueAt: new Date(Date.now() - 45 * 60 * 1000),
      },
    ),
  ]);

  await saveBy(
    messageRepository,
    { tenantId: tenant.id, externalMessageId: 'seed-msg-001' },
    {
      conversationId: openConversation.id,
      tenantId: tenant.id,
      senderType: 'customer',
      senderId: customer.id,
      messageType: 'text',
      content:
        'Hi, is the Mingalar X1 available today? I need delivery in Yangon.',
      externalMessageId: 'seed-msg-001',
      status: 'read',
    },
  );

  await Promise.all([
    saveBy(
      messageRepository,
      { tenantId: tenant.id, externalMessageId: 'seed-msg-004' },
      {
        conversationId: scenarioConversations[0].id,
        tenantId: tenant.id,
        senderType: 'customer',
        senderId: scenarioCustomers[0].id,
        messageType: 'text',
        content: 'Can I get a discount if I buy two clear cases with a phone?',
        externalMessageId: 'seed-msg-004',
        status: 'sent',
      },
    ),
    saveBy(
      messageRepository,
      { tenantId: tenant.id, externalMessageId: 'seed-msg-005' },
      {
        conversationId: scenarioConversations[1].id,
        tenantId: tenant.id,
        senderType: 'customer',
        senderId: scenarioCustomers[1].id,
        messageType: 'text',
        content: 'The charger in my bundle is not working. Can I return it?',
        externalMessageId: 'seed-msg-005',
        status: 'sent',
      },
    ),
    saveBy(
      messageRepository,
      { tenantId: tenant.id, externalMessageId: 'seed-msg-006' },
      {
        conversationId: scenarioConversations[2].id,
        tenantId: tenant.id,
        senderType: 'customer',
        senderId: scenarioCustomers[2].id,
        messageType: 'text',
        content:
          'I sent the bank transfer screenshot. Please confirm my order.',
        externalMessageId: 'seed-msg-006',
        status: 'sent',
      },
    ),
  ]);

  await saveBy(
    messageRepository,
    { tenantId: tenant.id, externalMessageId: 'seed-msg-002' },
    {
      conversationId: openConversation.id,
      tenantId: tenant.id,
      senderType: 'agent',
      senderId: supervisor.id,
      messageType: 'text',
      content:
        'Yes, the Mingalar X1 is in stock. I can reserve one and add same-day setup.',
      externalMessageId: 'seed-msg-002',
      status: 'delivered',
    },
  );

  await saveBy(
    messageRepository,
    { tenantId: tenant.id, externalMessageId: 'seed-msg-003' },
    {
      conversationId: pendingConversation.id,
      tenantId: tenant.id,
      senderType: 'customer',
      senderId: telegramCustomer.id,
      messageType: 'text',
      content:
        'Can you check whether my phone delivery is still arriving today?',
      externalMessageId: 'seed-msg-003',
      status: 'sent',
    },
  );

  const paidOrder = await saveByAny(
    orderRepository,
    [
      { tenantId: tenant.id, orderNumber: 'ORD-DEMO-001' },
      { tenantId: tenant.id, orderNumber: 'MM-ORD-1001' },
    ],
    {
      tenantId: tenant.id,
      customerId: customer.id,
      conversationId: openConversation.id,
      orderNumber: 'MM-ORD-1001',
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'online',
      subtotal: 500000,
      taxAmount: 0,
      discountAmount: 0,
      shippingFee: 3000,
      totalAmount: 503000,
      paidAmount: 503000,
      currency: 'MMK',
      notes: "Paid order created from Ko Zaw Zaw's Messenger conversation.",
      shippingAddress: JSON.stringify({ city: 'Yangon', township: 'Bahan' }),
      deliveryAssigneeName: 'Mingalar Delivery Team',
      deliveryAssigneePhone: '+95 9 400 000 301',
      statusHistory: [
        {
          status: 'pending',
          actorId: supervisor.id,
          source: 'seed',
          note: 'Created from Messenger conversation',
          timestamp: new Date().toISOString(),
        },
        {
          status: 'confirmed',
          actorId: supervisor.id,
          source: 'seed',
          note: 'Customer confirmed paid order',
          timestamp: new Date().toISOString(),
        },
      ],
      createdBy: supervisor.id,
    },
  );

  await saveByAny(
    orderItemRepository,
    [
      { orderId: paidOrder.id, productSku: 'DEMO-PHONE-001' },
      { orderId: paidOrder.id, productSku: 'MM-PHONE-001' },
    ],
    {
      orderId: paidOrder.id,
      productId: phoneProduct.id,
      productName: phoneProduct.name,
      productSku: phoneProduct.sku,
      productSnapshot: {
        productId: phoneProduct.id,
        name: phoneProduct.name,
        sku: phoneProduct.sku,
        type: phoneProduct.type,
        price: phoneProduct.price,
        status: phoneProduct.status,
      },
      variationSnapshot: { color: 'Black', storage: '128GB' },
      quantity: 1,
      unitPrice: 450000,
      totalPrice: 450000,
    },
  );

  await saveByAny(
    orderItemRepository,
    [
      { orderId: paidOrder.id, productSku: 'DEMO-SERVICE-001' },
      { orderId: paidOrder.id, productSku: 'MM-SETUP-001' },
    ],
    {
      orderId: paidOrder.id,
      productId: supportProduct.id,
      productName: supportProduct.name,
      productSku: supportProduct.sku,
      productSnapshot: {
        productId: supportProduct.id,
        name: supportProduct.name,
        sku: supportProduct.sku,
        type: supportProduct.type,
        price: supportProduct.price,
        status: supportProduct.status,
      },
      variationSnapshot: {},
      quantity: 1,
      unitPrice: 50000,
      totalPrice: 50000,
    },
  );

  type ScenarioOrder = {
    orderNumber: string;
    customerId: string;
    conversationId: string;
    product: Product;
    status: OrderStatus;
    deliveryStatus: DeliveryStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: string;
    quantity: number;
    subtotal: number;
    shippingFee: number;
    totalAmount: number;
    paidAmount: number;
    notes: string;
    deliveryAssigneeName: string;
    deliveryAssigneePhone: string;
  };

  const scenarioOrders: ScenarioOrder[] = [
    {
      orderNumber: 'MM-ORD-1002',
      customerId: telegramCustomer.id,
      conversationId: pendingConversation.id,
      product: phoneProduct,
      status: 'confirmed',
      deliveryStatus: 'out_for_delivery',
      paymentStatus: 'unpaid',
      paymentMethod: 'cod',
      quantity: 1,
      subtotal: 450000,
      shippingFee: 3500,
      totalAmount: 453500,
      paidAmount: 0,
      notes: 'COD delivery follow-up for Ma Hnin Ei.',
      deliveryAssigneeName: 'Ko Min Delivery',
      deliveryAssigneePhone: '+95 9 400 000 302',
    },
    {
      orderNumber: 'MM-ORD-1003',
      customerId: scenarioCustomers[0].id,
      conversationId: scenarioConversations[0].id,
      product: accessoryProducts[0],
      status: 'confirmed',
      deliveryStatus: 'packed',
      paymentStatus: 'unpaid',
      paymentMethod: 'bank_transfer',
      quantity: 2,
      subtotal: 36000,
      shippingFee: 2500,
      totalAmount: 38500,
      paidAmount: 0,
      notes: 'Accessory bundle waiting for payment.',
      deliveryAssigneeName: 'Packing Desk',
      deliveryAssigneePhone: '+95 9 400 000 303',
    },
    {
      orderNumber: 'MM-ORD-1004',
      customerId: scenarioCustomers[1].id,
      conversationId: scenarioConversations[1].id,
      product: accessoryProducts[1],
      status: 'confirmed',
      deliveryStatus: 'returned',
      paymentStatus: 'unpaid',
      paymentMethod: 'online',
      quantity: 1,
      subtotal: 35000,
      shippingFee: 0,
      totalAmount: 35000,
      paidAmount: 0,
      notes: 'Returned charger bundle; return completed.',
      deliveryAssigneeName: 'Returns Desk',
      deliveryAssigneePhone: '+95 9 400 000 304',
    },
    {
      orderNumber: 'MM-ORD-1005',
      customerId: scenarioCustomers[2].id,
      conversationId: scenarioConversations[2].id,
      product: phoneProduct,
      status: 'pending',
      deliveryStatus: 'packed',
      paymentStatus: 'unpaid',
      paymentMethod: 'bank_transfer',
      quantity: 1,
      subtotal: 450000,
      shippingFee: 3000,
      totalAmount: 453000,
      paidAmount: 0,
      notes: 'Bank transfer screenshot pending review.',
      deliveryAssigneeName: '',
      deliveryAssigneePhone: '',
    },
    {
      orderNumber: 'MM-ORD-1006',
      customerId: customer.id,
      conversationId: resolvedConversation.id,
      product: supportProduct,
      status: 'confirmed',
      deliveryStatus: 'delivered',
      paymentStatus: 'paid',
      paymentMethod: 'cod',
      quantity: 1,
      subtotal: 50000,
      shippingFee: 0,
      totalAmount: 50000,
      paidAmount: 50000,
      notes: 'Setup service completed after delivery.',
      deliveryAssigneeName: 'Mingalar Service Desk',
      deliveryAssigneePhone: '+95 9 400 000 305',
    },
    {
      orderNumber: 'MM-ORD-1007',
      customerId: scenarioCustomers[0].id,
      conversationId: scenarioConversations[0].id,
      product: accessoryProducts[2],
      status: 'cancelled',
      deliveryStatus: 'packed',
      paymentStatus: 'unpaid',
      paymentMethod: 'online',
      quantity: 1,
      subtotal: 65000,
      shippingFee: 0,
      totalAmount: 65000,
      paidAmount: 0,
      notes: 'Cancelled warranty add-on after failed payment.',
      deliveryAssigneeName: '',
      deliveryAssigneePhone: '',
    },
  ];

  const seededScenarioOrders: Order[] = [];

  for (const scenarioOrder of scenarioOrders) {
    const order = await saveBy(
      orderRepository,
      { tenantId: tenant.id, orderNumber: scenarioOrder.orderNumber },
      {
        tenantId: tenant.id,
        customerId: scenarioOrder.customerId,
        conversationId: scenarioOrder.conversationId,
        orderNumber: scenarioOrder.orderNumber,
        status: scenarioOrder.status,
        deliveryStatus: scenarioOrder.deliveryStatus,
        paymentStatus: scenarioOrder.paymentStatus,
        paymentMethod: scenarioOrder.paymentMethod,
        subtotal: scenarioOrder.subtotal,
        taxAmount: 0,
        discountAmount: 0,
        shippingFee: scenarioOrder.shippingFee,
        totalAmount: scenarioOrder.totalAmount,
        paidAmount: scenarioOrder.paidAmount,
        currency: 'MMK',
        notes: scenarioOrder.notes,
        shippingAddress: JSON.stringify({
          city: 'Yangon',
          country: 'Myanmar',
        }),
        deliveryAssigneeName: scenarioOrder.deliveryAssigneeName || undefined,
        deliveryAssigneePhone: scenarioOrder.deliveryAssigneePhone || undefined,
        statusHistory: [
          {
            status: 'pending',
            actorId: supervisor.id,
            source: 'seed',
            note: 'Seeded scenario order created',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          },
          {
            status: scenarioOrder.status,
            actorId: supervisor.id,
            source: 'seed',
            note: `Scenario moved to ${scenarioOrder.status}`,
            timestamp: new Date().toISOString(),
          },
        ],
        createdBy: supervisor.id,
      },
    );
    seededScenarioOrders.push(order);

    await saveBy(
      orderItemRepository,
      { orderId: order.id, productSku: scenarioOrder.product.sku },
      {
        orderId: order.id,
        productId: scenarioOrder.product.id,
        productName: scenarioOrder.product.name,
        productSku: scenarioOrder.product.sku,
        productSnapshot: {
          productId: scenarioOrder.product.id,
          name: scenarioOrder.product.name,
          sku: scenarioOrder.product.sku,
          type: scenarioOrder.product.type,
          price: scenarioOrder.product.price,
          status: scenarioOrder.product.status,
        },
        variationSnapshot: {},
        quantity: scenarioOrder.quantity,
        unitPrice: scenarioOrder.product.price,
        totalPrice:
          Number(scenarioOrder.product.price) * scenarioOrder.quantity,
      },
    );
  }

  await saveBy(
    cannedResponseRepository,
    { tenantId: tenant.id, shortcut: '/welcome' },
    {
      tenantId: tenant.id,
      title: 'Welcome',
      shortcut: '/welcome',
      content:
        'Hi! Thanks for contacting Mingalar Mobile. Are you asking about a phone, delivery, or setup?',
      tags: ['greeting', 'triage'],
      visibility: 'public',
      createdBy: tenantAdmin.id,
      usageCount: 12,
      isActive: true,
    },
  );

  await saveBy(
    domainEventRepository,
    {
      tenantId: tenant.id,
      entityType: 'order',
      entityId: paidOrder.id,
      eventType: 'order.created',
    },
    {
      tenantId: tenant.id,
      actorId: supervisor.id,
      actorType: 'tenant_user',
      entityType: 'order',
      entityId: paidOrder.id,
      eventType: 'order.created',
      source: 'seed',
      payload: {
        customerId: customer.id,
        conversationId: openConversation.id,
        orderNumber: paidOrder.orderNumber,
        status: paidOrder.status,
        paymentStatus: paidOrder.paymentStatus,
        totalAmount: paidOrder.totalAmount,
      },
    },
  );

  await saveBy(
    domainEventRepository,
    {
      tenantId: tenant.id,
      entityType: 'conversation',
      entityId: pendingConversation.id,
      eventType: 'conversation.sla_overdue',
    },
    {
      tenantId: tenant.id,
      actorType: 'system',
      entityType: 'conversation',
      entityId: pendingConversation.id,
      eventType: 'conversation.sla_overdue',
      source: 'seed',
      payload: {
        customerId: telegramCustomer.id,
        assignedAgentId: deliveryUser.id,
        slaDueAt: pendingConversation.slaDueAt,
      },
    },
  );

  await saveBy(
    cannedResponseRepository,
    { tenantId: tenant.id, shortcut: '/stock' },
    {
      tenantId: tenant.id,
      title: 'Stock Available',
      shortcut: '/stock',
      content:
        'This phone is available today. I can reserve it now and create your order from this chat.',
      tags: ['sales', 'stock'],
      visibility: 'team',
      createdBy: supervisor.id,
      usageCount: 8,
      isActive: true,
    },
  );

  await Promise.all([
    saveBy(
      cannedResponseRepository,
      { tenantId: tenant.id, shortcut: '/delivery' },
      {
        tenantId: tenant.id,
        title: 'Delivery Status',
        shortcut: '/delivery',
        content:
          'I can check your delivery status now. Please confirm your township and phone number.',
        tags: ['delivery', 'status'],
        visibility: 'public',
        createdBy: supervisor.id,
        usageCount: 6,
        isActive: true,
      },
    ),
    saveBy(
      cannedResponseRepository,
      { tenantId: tenant.id, shortcut: '/cod' },
      {
        tenantId: tenant.id,
        title: 'COD Reminder',
        shortcut: '/cod',
        content:
          'Your order is cash on delivery. Please prepare the exact amount for the rider.',
        tags: ['cod', 'payment'],
        visibility: 'team',
        createdBy: supervisor.id,
        usageCount: 4,
        isActive: true,
      },
    ),
    saveBy(
      cannedResponseRepository,
      { tenantId: tenant.id, shortcut: '/return' },
      {
        tenantId: tenant.id,
        title: 'Return Triage',
        shortcut: '/return',
        content:
          'I’m sorry about that. Please send the order number, product photo, and a short note about the issue.',
        tags: ['return', 'support'],
        visibility: 'public',
        createdBy: supervisor.id,
        usageCount: 3,
        isActive: true,
      },
    ),
  ]);

  await Promise.all([
    saveBy(
      notificationRepository,
      {
        tenantId: tenant.id,
        userId: financeUser.id,
        title: 'SLA overdue: payment review',
      },
      {
        tenantId: tenant.id,
        userId: financeUser.id,
        type: 'warning',
        title: 'SLA overdue: payment review',
        message: 'Thiha Aye is waiting for bank transfer confirmation.',
        actionUrl: '/dashboard/inbox?filter=overdue',
        isRead: false,
      },
    ),
    saveBy(
      notificationRepository,
      {
        tenantId: tenant.id,
        userId: supervisor.id,
        title: 'Media reply ready',
      },
      {
        tenantId: tenant.id,
        userId: supervisor.id,
        type: 'info',
        title: 'Media reply ready',
        message:
          'Seeded product images are available in the Media Library for reply attachments.',
        actionUrl: '/dashboard/media',
        isRead: false,
      },
    ),
    saveBy(
      notificationRepository,
      {
        tenantId: tenant.id,
        userId: supervisor.id,
        title: 'Return order needs review',
      },
      {
        tenantId: tenant.id,
        userId: supervisor.id,
        type: 'warning',
        title: 'Return order needs review',
        message:
          'Aung Myo has a returned charger order that needs supervisor review.',
        actionUrl: '/dashboard/orders',
        isRead: false,
      },
    ),
    saveBy(
      notificationRepository,
      {
        tenantId: tenant.id,
        userId: tenantAdmin.id,
        title: 'Demo workspace seeded',
      },
      {
        tenantId: tenant.id,
        userId: tenantAdmin.id,
        type: 'success',
        title: 'Demo workspace seeded',
        message:
          'Products, conversations, orders, media hooks, analytics, and billing data are ready.',
        actionUrl: '/dashboard',
        isRead: false,
      },
    ),
    saveBy(
      notificationRepository,
      {
        tenantId: tenant.id,
        userId: tenantOwner.id,
        title: 'Owner workspace summary',
      },
      {
        tenantId: tenant.id,
        userId: tenantOwner.id,
        type: 'info',
        title: 'Owner workspace summary',
        message:
          'Your demo workspace now includes seeded merchant users for owner, admin, supervisor, finance, and delivery roles.',
        actionUrl: '/dashboard/team',
        isRead: false,
      },
    ),
  ]);

  await Promise.all([
    saveBy(
      platformSettingRepository,
      { key: 'public_launch' },
      {
        key: 'public_launch',
        value: {
          workspaceName: 'ZayOS',
          supportEmail: 'support@zayos.local',
          demoSeed: true,
        },
      },
    ),
    saveBy(
      platformSettingRepository,
      { key: 'default_limits' },
      {
        key: 'default_limits',
        value: {
          maxAgents: businessLaunchPlan.maxAgents,
          maxChannels: businessLaunchPlan.maxChannels,
          messageLimit: businessLaunchPlan.messageLimit,
          storageLimitGb: businessLaunchPlan.storageLimitGb,
        },
      },
    ),
  ]);

  // ── Demo billing accounts ──────────────────────────────────────────────
  // Platform payment destinations seeded so `npm run seed:demo` leaves the
  // billing-accounts module non-empty and the paid KME-DEMO invoice linked.
  // Domain rules (BillingAccountService.assertAccountFields): bank_account
  // requires accountNo and forbids phno/qr; digital_wallet requires phno+qr
  // and forbids accountNo. Icons stay NULL per demo decision. No real QR file
  // exists for the demo wallet, so its qr is seeded as NULL (never a fake
  // file-id-shaped placeholder: the console resolves bare ids as real files
  // and a stale reference breaks the page). The edit dialog will require a
  // real QR upload before this wallet can be re-saved.
  const demoBankAccount = await saveBy(
    billingAccountRepository,
    { accountName: 'KBZ Bank - ZayOS Collections' },
    {
      accountName: 'KBZ Bank - ZayOS Collections',
      type: 'bank_account',
      accountNo: '200400200400001',
      isPublic: true,
      isActive: true,
      createdBy: platformAdmin.id,
      updatedBy: platformAdmin.id,
    },
  );

  const demoWalletAccount = await saveBy(
    billingAccountRepository,
    { accountName: 'KBZPay - ZayOS Collections' },
    {
      accountName: 'KBZPay - ZayOS Collections',
      type: 'digital_wallet',
      phno: '+95 9 400 000 901',
      isPublic: true,
      isActive: true,
      createdBy: platformAdmin.id,
      updatedBy: platformAdmin.id,
    },
  );
  // saveBy only overwrites provided keys, so explicitly clear a stale qr
  // left by earlier seeds (e.g. the retired demo placeholder).
  if (demoWalletAccount.qr) {
    await billingAccountRepository.update(demoWalletAccount.id, {
      qr: null,
    } as unknown as Partial<BillingAccount>);
  }
  console.log(
    `Demo billing accounts: ${demoBankAccount.accountName}, ${demoWalletAccount.accountName}`,
  );

  const billingStart = yangonCalendarDate(subscriptionStartDate);
  const billingEnd = yangonCalendarDate(
    new Date(subscriptionEndDate.getTime() - 1),
  );
  await Promise.all([
    saveBy(
      billingRecordRepository,
      { tenantId: tenant.id, invoiceNo: 'INV-MM-2026-001' },
      {
        tenantId: tenant.id,
        subscriptionPlanId: businessLaunchPlan.id,
        invoiceNo: 'INV-MM-2026-001',
        billingPeriodStart: billingStart,
        billingPeriodEnd: billingEnd,
        reviewStatus: 'confirm',
        amountDue: 500000,
        amountPaid: 500000,
        currency: 'MMK',
        paidAt: new Date(),
        issueDate: new Date(),
        notes: 'Paid demo tenant billing record.',
        billingAccountId: demoBankAccount.id,
        billingAccountRef: demoBankAccount.accountName,
        metadata: {
          source: 'seed',
          scenario: 'paid subscription',
          selectedPaymentAccountId: demoBankAccount.id,
        },
      },
    ),
    saveBy(
      billingRecordRepository,
      { tenantId: tenant.id, invoiceNo: 'INV-MM-2026-002' },
      {
        tenantId: tenant.id,
        subscriptionPlanId: businessLaunchPlan.id,
        invoiceNo: 'INV-MM-2026-002',
        billingPeriodStart: new Date(
          billingEnd.getTime() + 24 * 60 * 60 * 1000,
        ),
        billingPeriodEnd: new Date(
          billingEnd.getTime() + 31 * 24 * 60 * 60 * 1000,
        ),
        reviewStatus: 'in_review',
        amountDue: 500000,
        amountPaid: 0,
        currency: 'MMK',
        issueDate: new Date(),
        notes: 'Upcoming unpaid demo invoice.',
        metadata: { source: 'seed', scenario: 'upcoming invoice' },
      },
    ),
  ]);

  // Period-scoped enforcement requires the demo tenant to have a purchased
  // period, not only the legacy entitlement and billing records above. Keep
  // this repair scoped to KME-DEMO so rerunning the demo seed never performs a
  // production-wide backfill or touches unrelated tenants.
  const paidBillingRecord = await billingRecordRepository.findOne({
    where: {
      tenantId: tenant.id,
      invoiceNo: 'INV-MM-2026-001',
      reviewStatus: 'confirm',
    },
  });
  if (!paidBillingRecord) {
    throw new Error('Seeded paid demo billing record was not found.');
  }

  const existingPeriods = await subscriptionPeriodRepository.find({
    where: { tenantId: tenant.id },
    order: { sequenceNumber: 'ASC' },
  });
  const periodIsActiveNow = (period: TenantSubscriptionPeriod) => {
    if (
      period.periodType !== 'paid' ||
      period.periodStatus !== 'active' ||
      period.paymentStatus !== 'paid'
    ) {
      return false;
    }
    const start = period.monthStartAt ?? period.periodStartAt;
    const end = period.monthEndAt ?? period.periodEndAt;
    return Boolean(
      start &&
      end &&
      seedNow.getTime() >= start.getTime() &&
      seedNow.getTime() < end.getTime(),
    );
  };
  const conflictingActivePeriod = existingPeriods.find(
    (period) =>
      periodIsActiveNow(period) && period.planId !== businessLaunchPlan.id,
  );
  if (conflictingActivePeriod) {
    throw new Error(
      `KME-DEMO already has an active period for a different plan (${conflictingActivePeriod.planId}); refusing to overwrite it.`,
    );
  }

  const isCurrentYangonMonth = (period: TenantSubscriptionPeriod) =>
    period.monthStartAt?.getTime() === subscriptionStartDate.getTime() &&
    period.monthEndAt?.getTime() === subscriptionEndDate.getTime();
  const incompatibleActivePeriod = existingPeriods.find(
    (period) =>
      period.planId === businessLaunchPlan.id &&
      periodIsActiveNow(period) &&
      !isCurrentYangonMonth(period),
  );
  if (incompatibleActivePeriod) {
    throw new Error(
      `KME-DEMO active period ${incompatibleActivePeriod.id} is not aligned to the current Yangon calendar month; refusing to create a duplicate active period.`,
    );
  }

  let seededActivePeriod = existingPeriods.find(
    (period) =>
      period.planId === businessLaunchPlan.id &&
      periodIsActiveNow(period) &&
      isCurrentYangonMonth(period),
  );
  if (
    seededActivePeriod &&
    seededActivePeriod.billingRecordId !== paidBillingRecord.id
  ) {
    throw new Error(
      `KME-DEMO active period ${seededActivePeriod.id} is not linked to the seeded paid billing record; refusing to silently reuse it.`,
    );
  }
  let createdPeriod = false;
  if (!seededActivePeriod) {
    const linkedPeriod = existingPeriods.find(
      (period) => period.billingRecordId === paidBillingRecord.id,
    );
    if (linkedPeriod) {
      linkedPeriod.periodStatus = 'active';
      linkedPeriod.paymentStatus = 'paid';
      linkedPeriod.adminActivationStatus = 'approved';
      linkedPeriod.adminActivatedAt = seedNow;
      linkedPeriod.adminActivatedBy = platformAdmin.id;
      linkedPeriod.adminActivationReason =
        'Seeded demo paid period is confirmed and activated';
      linkedPeriod.periodStartAt = subscriptionStartDate;
      linkedPeriod.periodEndAt = subscriptionEndDate;
      linkedPeriod.monthStartAt = subscriptionStartDate;
      linkedPeriod.monthEndAt = subscriptionEndDate;
      linkedPeriod.scheduledStartAt = subscriptionStartDate;
      linkedPeriod.scheduledEndAt = subscriptionEndDate;
      linkedPeriod.activatedAt = seedNow;
      linkedPeriod.expiredAt = null;
      linkedPeriod.endReason = null;
      linkedPeriod.quotaSnapshot = buildQuotaSnapshot(businessLaunchPlan);
      seededActivePeriod =
        await subscriptionPeriodRepository.save(linkedPeriod);
    } else {
      seededActivePeriod = await saveBy(
        subscriptionPeriodRepository,
        { tenantId: tenant.id, billingRecordId: paidBillingRecord.id },
        {
          tenantId: tenant.id,
          planId: businessLaunchPlan.id,
          billingRecordId: paidBillingRecord.id,
          periodType: 'paid',
          periodStatus: 'active',
          paymentStatus: 'paid',
          durationDays: Math.max(
            1,
            Math.round(
              (subscriptionEndDate.getTime() -
                subscriptionStartDate.getTime()) /
                86_400_000,
            ),
          ),
          periodStartAt: subscriptionStartDate,
          periodEndAt: subscriptionEndDate,
          monthStartAt: subscriptionStartDate,
          monthEndAt: subscriptionEndDate,
          startOption: 'current_month',
          scheduledStartAt: subscriptionStartDate,
          scheduledEndAt: subscriptionEndDate,
          activatedAt: seedNow,
          // Plan 14: the demo tenant must be operational immediately after a
          // fresh reseed. Without an explicit admin activation the period is
          // treated as awaiting activation and login is blocked with
          // SUBSCRIPTION_PERIOD_NOT_ACTIVE. The seed represents a confirmed +
          // activated sale, so mark it approved like the plan-14 fixtures do.
          adminActivationStatus: 'approved',
          adminActivatedAt: seedNow,
          adminActivatedBy: platformAdmin.id,
          adminActivationReason:
            'Seeded demo paid period is confirmed and activated',
          expiredAt: null,
          endReason: null,
          activationReason: 'initial',
          sequenceNumber:
            existingPeriods.reduce(
              (highest, period) =>
                Math.max(highest, period.sequenceNumber || 0),
              0,
            ) + 1,
          quotaSnapshot: buildQuotaSnapshot(businessLaunchPlan),
          metadata: {
            source: 'seed',
            scenario: 'paid_current_yangon_month',
          },
        },
      );
      createdPeriod = true;
    }
  }

  if (createdPeriod) {
    await saveBy(
      subscriptionPeriodEventRepository,
      {
        idempotencyKey: `seed:tenant-period:${tenant.id}:${subscriptionStartDate.toISOString()}`,
      },
      {
        subscriptionPeriodId: seededActivePeriod.id,
        tenantId: tenant.id,
        eventType: 'period_created',
        previousStatus: null,
        newStatus: 'active',
        actorType: 'system',
        actorId: 'seed',
        source: 'seed',
        reason: 'Created demo tenant active paid Yangon month period',
        idempotencyKey: `seed:tenant-period:${tenant.id}:${subscriptionStartDate.toISOString()}`,
        metadata: { billingRecordId: paidBillingRecord.id },
      },
    );
  }
  console.log(
    `Active demo subscription period: ${seededActivePeriod.id}${createdPeriod ? ' (created)' : ' (already present)'}`,
  );

  const usageBillingPeriod = currentBillingPeriod(seedNow);

  await Promise.all([
    saveBy(
      usageEventRepository,
      {
        tenantId: tenant.id,
        usageType: 'provider_message',
        direction: 'inbound',
        source: 'seed-inbound-messenger',
      },
      {
        tenantId: tenant.id,
        channelId: messengerChannel.id,
        provider: 'messenger',
        usageType: 'provider_message',
        direction: 'inbound',
        quantity: 18,
        source: 'seed-inbound-messenger',
        metadata: { scenario: 'customer messages' },
        // Plan 14: link to the seeded active period so the period-scoped
        // usage model counts the demo usage against the quota snapshot.
        subscriptionPeriodId: seededActivePeriod.id,
        ...usageBillingPeriod,
      },
    ),
    saveBy(
      usageEventRepository,
      {
        tenantId: tenant.id,
        usageType: 'provider_message',
        direction: 'outbound',
        source: 'seed-outbound-workspace',
      },
      {
        tenantId: tenant.id,
        channelId: messengerChannel.id,
        provider: 'messenger',
        usageType: 'provider_message',
        direction: 'outbound',
        quantity: 14,
        source: 'seed-outbound-workspace',
        metadata: { scenario: 'workspace replies' },
        // Plan 14: link to the seeded active period (see inbound event).
        subscriptionPeriodId: seededActivePeriod.id,
        ...usageBillingPeriod,
      },
    ),
    saveBy(
      usageEventRepository,
      {
        tenantId: tenant.id,
        usageType: 'api_request',
        direction: 'request',
        source: 'seed-api-dashboard',
      },
      {
        tenantId: tenant.id,
        channelId: null,
        provider: null,
        usageType: 'api_request',
        direction: 'request',
        quantity: 42,
        // Plan 14: link to the seeded active period (see inbound event).
        subscriptionPeriodId: seededActivePeriod.id,
        source: 'seed-api-dashboard',
        requestPath: '/api/v1/agent/dashboard/stats',
        requestMethod: 'GET',
        metadata: { scenario: 'workspace browsing' },
        ...usageBillingPeriod,
      },
    ),
  ]);

  for (const seededOrder of seededScenarioOrders) {
    await saveBy(
      domainEventRepository,
      {
        tenantId: tenant.id,
        entityType: 'order',
        entityId: seededOrder.id,
        eventType: 'order.seeded',
      },
      {
        tenantId: tenant.id,
        actorId: supervisor.id,
        actorType: 'tenant_user',
        entityType: 'order',
        entityId: seededOrder.id,
        eventType: 'order.seeded',
        source: 'seed',
        payload: {
          customerId: seededOrder.customerId,
          conversationId: seededOrder.conversationId,
          orderNumber: seededOrder.orderNumber,
          status: seededOrder.status,
          paymentStatus: seededOrder.paymentStatus,
          totalAmount: seededOrder.totalAmount,
        },
      },
    );
  }

  for (const seededConversation of scenarioConversations) {
    await saveBy(
      domainEventRepository,
      {
        tenantId: tenant.id,
        entityType: 'conversation',
        entityId: seededConversation.id,
        eventType: 'conversation.seeded',
      },
      {
        tenantId: tenant.id,
        actorType: 'system',
        entityType: 'conversation',
        entityId: seededConversation.id,
        eventType: 'conversation.seeded',
        source: 'seed',
        payload: {
          customerId: seededConversation.customerId,
          status: seededConversation.status,
          priority: seededConversation.priority,
          tags: seededConversation.tags,
        },
      },
    );
  }

  const analyticsDate = today();
  await saveBy(
    tenantAnalyticsRepository,
    { tenantId: tenant.id, date: analyticsDate },
    {
      tenantId: tenant.id,
      date: analyticsDate,
      totalConversations: 6,
      newConversations: 5,
      resolvedConversations: 1,
      totalMessages: 30,
      avgResponseTimeSeconds: 135,
      avgResolutionTimeSeconds: 1800,
      activeAgents: 5,
      customerSatisfactionAvg: 4.8,
    },
  );

  await saveBy(
    agentAnalyticsRepository,
    { tenantId: tenant.id, agentId: deliveryUser.id, date: analyticsDate },
    {
      tenantId: tenant.id,
      agentId: deliveryUser.id,
      date: analyticsDate,
      conversationsHandled: 4,
      messagesSent: 18,
      avgResponseTimeSeconds: 125,
      avgResolutionTimeSeconds: 1600,
      customerSatisfactionAvg: 4.7,
      onlineTimeMinutes: 360,
    },
  );

  await saveBy(
    agentAnalyticsRepository,
    { tenantId: tenant.id, agentId: supervisor.id, date: analyticsDate },
    {
      tenantId: tenant.id,
      agentId: supervisor.id,
      date: analyticsDate,
      conversationsHandled: 2,
      messagesSent: 8,
      avgResponseTimeSeconds: 160,
      avgResolutionTimeSeconds: 2100,
      customerSatisfactionAvg: 4.9,
      onlineTimeMinutes: 420,
    },
  );

  // ── Warning-banner test tenant ───────────────────────────────────────────
  // Single isolated tenant that exercises the workspace warning banner with
  // mixed quota-usage severity (outbound critical + inbound warning). Uses the
  // Guided Pilot plan (inbound: 4000, outbound: 1000, 7-day duration). Includes
  // billing record and subscription period following the same creation pattern
  // as KME-DEMO.

  async function upsertWarningTenant(
    code: string,
    companyName: string,
    ownerEmail: string,
  ): Promise<Tenant> {
    return saveBy(
      tenantRepository,
      { tenantCode: code },
      {
        tenantCode: code,
        companyName,
        industry: 'Development',
        businessType: 'Warning banner test',
        contactPerson: 'Test User',
        contactEmail: ownerEmail,
        contactPhone: '+95 9 700 000 000',
        address: 'Yangon, Myanmar',
        status: 'active',
        subscriptionPlanId: guidedPilotPlan.id,
        timezone: 'Asia/Yangon',
        language: 'en',
        featureFlags: {},
        aiSettings: { enabled: false },
        approvedAt: seedNow,
        approvedBy: platformAdmin.id,
      },
    );
  }

  async function upsertWarningUser(
    tenantId: string,
    email: string,
  ): Promise<void> {
    await saveBy(
      tenantUserRepository,
      { normalizedEmail: normalizeIdentityEmail(email) },
      {
        tenantId,
        fullName: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        email,
        normalizedEmail: normalizeIdentityEmail(email),
        passwordHash,
        role: 'owner',
        status: 'active',
        emailVerifiedAt: seedNow,
      },
    );
  }

  // KME-USAGE-MIXED — outbound critical (95%) + inbound warning (80%)
  const usageMixed = await upsertWarningTenant(
    'KME-USAGE-MIXED',
    'Mixed Usage Test',
    'admin@kme-usage-mixed.local',
  );
  await upsertWarningUser(usageMixed.id, 'admin@kme-usage-mixed.local');

  // Billing record (following KME-DEMO pattern)
  const warningBillingStart = yangonCalendarDate(seedNow);
  const warningBillingEnd = yangonCalendarDate(
    new Date(seedNow.getTime() + 7 * 24 * 60 * 60 * 1000),
  );
  await saveBy(
    billingRecordRepository,
    { tenantId: usageMixed.id, invoiceNo: 'INV-MIXED-2026-001' },
    {
      tenantId: usageMixed.id,
      subscriptionPlanId: guidedPilotPlan.id,
      invoiceNo: 'INV-MIXED-2026-001',
      billingPeriodStart: warningBillingStart,
      billingPeriodEnd: warningBillingEnd,
      reviewStatus: 'confirm',
      amountDue: 300000,
      amountPaid: 300000,
      currency: 'MMK',
      paidAt: seedNow,
      issueDate: seedNow,
      notes: 'Paid warning-banner test tenant billing record.',
      metadata: { source: 'seed', scenario: 'warning-banner test' },
    },
  );

  // Subscription period
  const usageMixedPeriod = await saveBy(
    subscriptionPeriodRepository,
    { tenantId: usageMixed.id, periodType: 'paid' },
    {
      tenantId: usageMixed.id,
      planId: guidedPilotPlan.id,
      periodType: 'paid',
      periodStatus: 'active',
      paymentStatus: 'paid',
      adminActivationStatus: 'approved',
      adminActivatedAt: seedNow,
      durationDays: 7,
      periodStartAt: seedNow,
      periodEndAt: addDays(seedNow, 7),
      monthStartAt: seedNow,
      monthEndAt: addDays(seedNow, 7),
      startOption: 'current_month',
      sequenceNumber: 1,
      quotaSnapshot: buildQuotaSnapshot(guidedPilotPlan),
    },
  );

  // Usage events: outbound 95% (critical) + inbound 80% (warning)
  const warningBillingPeriod = currentBillingPeriod();
  await Promise.all([
    saveBy(
      usageEventRepository,
      { sourceRequestId: 'seed:usage-mixed:inbound' },
      {
        tenantId: usageMixed.id,
        provider: 'messenger',
        usageType: 'provider_message',
        direction: 'inbound',
        quantity: Math.round(4000 * 0.8),
        source: 'seed',
        subscriptionPeriodId: usageMixedPeriod.id,
        ...warningBillingPeriod,
      },
    ),
    saveBy(
      usageEventRepository,
      { sourceRequestId: 'seed:usage-mixed:outbound' },
      {
        tenantId: usageMixed.id,
        provider: 'messenger',
        usageType: 'provider_message',
        direction: 'outbound',
        quantity: Math.round(1000 * 0.95),
        source: 'seed',
        subscriptionPeriodId: usageMixedPeriod.id,
        ...warningBillingPeriod,
      },
    ),
  ]);
  console.log(
    '  ✅ KME-USAGE-MIXED — outbound critical (95%) + inbound warning (80%) + billing',
  );

  // KME-NO-PLAN — tenant with no plan subscribed. No subscriptionPlanId,
  // no dates, and deliberately no entitlement / billing / period rows so the
  // empty-plan path (SUBSCRIPTION_PERIOD_NOT_ACTIVE) can be exercised.
  const noPlanTenant = await saveBy(
    tenantRepository,
    { tenantCode: 'KME-NO-PLAN' },
    {
      tenantCode: 'KME-NO-PLAN',
      companyName: 'No Plan Test',
      industry: 'Development',
      businessType: 'No-plan state test',
      contactPerson: 'Test User',
      contactEmail: 'owner@kme-no-plan.local',
      contactPhone: '+95 9 700 000 001',
      address: 'Yangon, Myanmar',
      status: 'active',
      // No subscriptionPlanId / subscriptionStartDate / subscriptionEndDate:
      // omitting them leaves the nullable columns NULL (no plan subscribed).
      timezone: 'Asia/Yangon',
      language: 'en',
      featureFlags: {},
      aiSettings: { enabled: false },
      approvedAt: seedNow,
      approvedBy: platformAdmin.id,
    },
  );
  await upsertWarningUser(noPlanTenant.id, 'owner@kme-no-plan.local');
  console.log('  ✅ KME-NO-PLAN — active tenant with no plan subscribed');

  console.log(`Seed complete: ${DEMO_SCENARIO_TITLE}`);
  console.log('Platform admin: platform@kme.local / Password123!');
  console.log('Platform ops:   ops@kme.local / Password123!');
  console.log('Platform IT:    it@kme.local / Password123!');
  console.log('Platform fin:   finance-viewer@kme.local / Password123!');
  console.log('Platform sup:   support-viewer@kme.local / Password123!');
  console.log('Platform read:  readonly@kme.local / Password123!');
  console.log('Tenant owner:   owner@demo.local / Password123!');
  console.log('Tenant admin:   admin@demo.local / Password123!');
  console.log('Manager:        supervisor@demo.local / Password123!');
  console.log('Finance:        finance@demo.local / Password123!');
  console.log('Delivery:       delivery@demo.local / Password123!');
  console.log('Warning tenant: admin@kme-usage-mixed.local / Password123!');
  console.log('No-plan tenant: owner@kme-no-plan.local / Password123!');
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });
