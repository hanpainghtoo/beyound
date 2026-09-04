import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { isSchemaSyncEnabled } from '../config/database-safety.util';
import { join } from 'path';

// Load environment variables from multiple possible locations
config({ path: join(__dirname, '../../.env') }); // Root directory
config({ path: join(__dirname, '../.env') }); // Backend directory

// Import all entities
import { PlatformAdmin } from '../auth/entities/platform-admin.entity';
import { TenantUser } from '../auth/entities/tenant-user.entity';
import { PasswordResetToken } from '../auth/entities/password-reset-token.entity';
import { EmailVerificationToken } from '../auth/entities/email-verification-token.entity';
import { TenantPolicyConsent } from '../auth/entities/tenant-policy-consent.entity';
import { LegalPolicy } from '../legal-policy/entities/legal-policy.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { TenantRateLimit } from '../tenant/entities/tenant-rate-limit.entity';
import { ChannelTemplate } from '../channel/entities/channel-template.entity';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { TelegramManagedBotOnboardingRequest } from '../channel/entities/telegram-managed-bot-onboarding-request.entity';
import { Customer } from '../customer/entities/customer.entity';
import { Conversation } from '../conversation/entities/conversation.entity';
import { InboundProviderEvent } from '../conversation/entities/inbound-provider-event.entity';
import { Message } from '../conversation/entities/message.entity';
import { OutboundMessageCommand } from '../conversation/entities/outbound-message-command.entity';
import { ProductCategory } from '../product/entities/product-category.entity';
import { Product } from '../product/entities/product.entity';
import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order/entities/order-item.entity';
import { CannedResponse } from '../common/entities/canned-response.entity';
import { TenantAnalytics } from '../analytics/entities/tenant-analytics.entity';
import { CsrAnalytics } from '../analytics/entities/csr-analytics.entity';
import { Notification } from '../common/entities/notification.entity';
import { PlatformSetting } from '../platform-admin/entities/platform-setting.entity';
import { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import { DomainEvent } from '../domain-event/entities/domain-event.entity';
import { PlatformAuditLog } from '../logging/entities/platform-audit-log.entity';
import { TenantAuditLog } from '../logging/entities/tenant-audit-log.entity';
import { TenantUsageEvent } from '../usage/entities/tenant-usage-event.entity';
import { TenantEntitlement } from '../entitlement/entities/tenant-entitlement.entity';
import { TenantEntitlementEvent } from '../entitlement/entities/tenant-entitlement-event.entity';
import { TenantSubscriptionPeriod } from '../subscription-period/entities/tenant-subscription-period.entity';
import { SubscriptionPeriodEvent } from '../subscription-period/entities/subscription-period-event.entity';
import { TenantSubscriptionPeriodUpgradeRevision } from '../subscription-period/entities/tenant-subscription-period-upgrade-revision.entity';
import { SubscriptionAddOnProduct } from '../subscription-add-on/entities/subscription-add-on-product.entity';
import { SubscriptionAddOnProductComponent } from '../subscription-add-on/entities/subscription-add-on-product-component.entity';
import { SubscriptionAddOnEvent } from '../subscription-add-on/entities/subscription-add-on-event.entity';
import { TenantSubscriptionAddOnPurchase } from '../subscription-add-on/entities/tenant-subscription-add-on-purchase.entity';
import { TenantSubscriptionAddOnComponent } from '../subscription-add-on/entities/tenant-subscription-add-on-component.entity';
import { TenantSubscriptionAddOnPurchaseEvent } from '../subscription-add-on/entities/tenant-subscription-add-on-purchase-event.entity';
import { ThrottlerRateLimit } from '../common/entities/throttler-rate-limit.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number.parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'kme_omnichannel',
  synchronize: isSchemaSyncEnabled(
    process.env.NODE_ENV,
    process.env.DB_SYNCHRONIZE,
  ),
  logging: process.env.NODE_ENV === 'development',
  entities: [
    PlatformAdmin,
    TenantUser,
    PasswordResetToken,
    EmailVerificationToken,
    TenantPolicyConsent,
    LegalPolicy,
    Tenant,
    SubscriptionPlan,
    TenantRateLimit,
    ChannelTemplate,
    TenantChannel,
    TelegramManagedBotOnboardingRequest,
    Customer,
    Conversation,
    InboundProviderEvent,
    Message,
    OutboundMessageCommand,
    ProductCategory,
    Product,
    Order,
    OrderItem,
    CannedResponse,
    TenantAnalytics,
    CsrAnalytics,
    Notification,
    PlatformSetting,
    TenantBillingRecord,
    DomainEvent,
    PlatformAuditLog,
    TenantAuditLog,
    TenantUsageEvent,
    TenantEntitlement,
    TenantEntitlementEvent,
    TenantSubscriptionPeriod,
    SubscriptionPeriodEvent,
    TenantSubscriptionPeriodUpgradeRevision,
    SubscriptionAddOnProduct,
    SubscriptionAddOnProductComponent,
    SubscriptionAddOnEvent,
    TenantSubscriptionAddOnPurchase,
    TenantSubscriptionAddOnComponent,
    TenantSubscriptionAddOnPurchaseEvent,
    ThrottlerRateLimit,
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  subscribers: [__dirname + '/subscribers/*{.ts,.js}'],
});
