import { assertStrongPassword } from '../auth/password-policy';

export type ProductionSubscriptionPlanSeed = {
  name: string;
  description: string;
  monthlyPrice: number;
  durationDays: number;
  messageQuotaMode: 'combined' | 'directional';
  maxCsrs: number;
  maxChannels: number;
  messageLimit: number | null;
  inboundMessageLimit: number | null;
  outboundMessageLimit: number | null;
  allowedProviders: string[];
  apiLimit: number | null;
  storageLimitGb: number;
  status: 'active';
  features: Record<string, unknown>;
};

// Public pricing and self-serve workspace registration both read active
// subscription plans from the database, so these records are required
// production bootstrap data rather than demo content.
export const productionSubscriptionPlans: ProductionSubscriptionPlanSeed[] = [
  {
    name: 'Guided Pilot',
    description:
      'Guided pilot workspace for validating one real commerce workflow before full rollout.',
    monthlyPrice: 300000,
    durationDays: 7,
    messageQuotaMode: 'combined',
    maxCsrs: 3,
    maxChannels: 1,
    messageLimit: 5000,
    inboundMessageLimit: 4000,
    outboundMessageLimit: 1000,
    allowedProviders: ['messenger', 'telegram'],
    apiLimit: 10000,
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
        ctaLabel: 'Start a Paid Pilot',
        ctaHref: '/contact?intent=sales&source=pricing&package=Guided%20Pilot',
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
  {
    name: 'Business Launch',
    description: 'Primary production package for growing commerce teams.',
    monthlyPrice: 500000,
    durationDays: 14,
    messageQuotaMode: 'combined',
    maxCsrs: 5,
    maxChannels: 2,
    messageLimit: 20000,
    inboundMessageLimit: 16000,
    outboundMessageLimit: 4000,
    allowedProviders: ['messenger', 'telegram'],
    apiLimit: 50000,
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
  {
    name: 'Business Growth',
    description: 'Scale package for higher message and order volumes.',
    monthlyPrice: 1000000,
    durationDays: 30,
    messageQuotaMode: 'combined',
    maxCsrs: 15,
    maxChannels: 4,
    messageLimit: 100000,
    inboundMessageLimit: 80000,
    outboundMessageLimit: 20000,
    allowedProviders: ['messenger', 'telegram', 'viber'],
    apiLimit: 250000,
    storageLimitGb: 50,
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
          'Supervisor and management controls',
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
  {
    name: 'Enterprise',
    description:
      'For larger organizations requiring multiple brands, custom reporting, or tailored operational workflows.',
    monthlyPrice: 0,
    durationDays: 30,
    messageQuotaMode: 'combined',
    maxCsrs: 0,
    maxChannels: 0,
    messageLimit: null,
    inboundMessageLimit: null,
    outboundMessageLimit: null,
    allowedProviders: ['messenger', 'telegram', 'viber', 'tiktok'],
    apiLimit: null,
    storageLimitGb: 0,
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
        ctaLabel: 'Talk to Sales',
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
];

export function getProductionBootstrapAdminConfig(env: NodeJS.ProcessEnv) {
  const fullName = env.PRODUCTION_PLATFORM_ADMIN_FULL_NAME?.trim();
  const email = env.PRODUCTION_PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.PRODUCTION_PLATFORM_ADMIN_PASSWORD?.trim();

  if (!fullName)
    throw new Error('PRODUCTION_PLATFORM_ADMIN_FULL_NAME is required.');
  if (!email) throw new Error('PRODUCTION_PLATFORM_ADMIN_EMAIL is required.');
  if (!password)
    throw new Error('PRODUCTION_PLATFORM_ADMIN_PASSWORD is required.');
  if (email.endsWith('.local'))
    throw new Error(
      'PRODUCTION_PLATFORM_ADMIN_EMAIL must not use a .local address.',
    );
  assertStrongPassword(password);

  return { fullName, email, password };
}

export function assertProductionBootstrapDatabaseConfig(
  env: NodeJS.ProcessEnv,
) {
  for (const envVarName of [
    'DB_HOST',
    'DB_PORT',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_NAME',
  ]) {
    if (!env[envVarName]?.trim()) {
      throw new Error(`${envVarName} is required.`);
    }
  }
}
