const SUPPORTED_WEBHOOK_PROVIDERS = new Set([
  'telegram',
  'messenger',
  'viber',
  'tiktok',
]);

const MESSENGER_SHARED_ROUTING_SEGMENT =
  process.env.MESSENGER_PROVIDER_APP_ROUTING_ID ||
  process.env.META_PROVIDER_APP_ROUTING_ID ||
  'shared';

export function getMessengerSharedRoutingSegment(): string {
  return (
    process.env.MESSENGER_PROVIDER_APP_ROUTING_ID ||
    process.env.META_PROVIDER_APP_ROUTING_ID ||
    MESSENGER_SHARED_ROUTING_SEGMENT
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export { UUID_PATTERN };

export type BuildProviderWebhookUrlInput = {
  baseUrl: string;
  provider: string;
  channelId: string;
  nodeEnv?: string;
};

export function buildProviderWebhookUrl(
  input: BuildProviderWebhookUrlInput,
): string {
  const provider = normalizeWebhookProvider(input.provider);
  const baseUrl = normalizeWebhookBaseUrl(input.baseUrl, input.nodeEnv);

  if (provider === 'messenger') {
    return `${baseUrl}/webhooks/${encodeURIComponent(provider)}/${encodeURIComponent(getMessengerSharedRoutingSegment())}`;
  }

  const channelId = normalizeWebhookChannelId(input.channelId);
  return `${baseUrl}/webhooks/${encodeURIComponent(provider)}/${encodeURIComponent(channelId)}`;
}

export function normalizeWebhookProvider(provider: string): string {
  const normalized = (provider || '').trim().toLowerCase();
  if (!SUPPORTED_WEBHOOK_PROVIDERS.has(normalized)) {
    throw new Error(`Unsupported webhook provider: ${provider}`);
  }
  return normalized;
}

export function normalizeWebhookChannelId(channelId: string): string {
  const normalized = (channelId || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(
      'Webhook channel identifier must be a persisted channel UUID.',
    );
  }
  return normalized;
}

function normalizeWebhookBaseUrl(
  baseUrl: string,
  nodeEnv = process.env.NODE_ENV,
): string {
  const raw = (baseUrl || '').trim();
  if (!raw) {
    throw new Error('Webhook public base URL is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Webhook public base URL must be a valid absolute URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Webhook public base URL must use HTTP or HTTPS.');
  }

  if (nodeEnv === 'production' && parsed.protocol !== 'https:') {
    throw new Error('Webhook public base URL must use HTTPS in production.');
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/+$/, '');
}
