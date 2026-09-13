import { buildProviderWebhookUrl } from './provider-webhook-url.util';

const channelId = '9db7cb15-f4d4-4ac6-b87e-c21f84d32875';

describe('provider webhook URL builder', () => {
  it.each([
    ['telegram', channelId],
    ['viber', channelId],
    ['tiktok', channelId],
  ])('builds a UUID callback URL for %s', (provider, expectedChannelId) => {
    expect(
      buildProviderWebhookUrl({
        baseUrl: 'https://hooks.example.com/',
        provider,
        channelId: expectedChannelId,
      }),
    ).toBe(
      `https://hooks.example.com/webhooks/${provider}/${expectedChannelId}`,
    );
  });

  it('builds a fixed shared callback URL for messenger instead of a per-channel UUID', () => {
    process.env.MESSENGER_PROVIDER_APP_ROUTING_ID = 'shared';
    expect(
      buildProviderWebhookUrl({
        baseUrl: 'https://hooks.example.com/',
        provider: 'messenger',
        channelId,
      }),
    ).toBe('https://hooks.example.com/webhooks/messenger/shared');
    delete process.env.MESSENGER_PROVIDER_APP_ROUTING_ID;
  });

  it('builds a shared callback URL for messenger using the meta app routing id env var', () => {
    process.env.META_PROVIDER_APP_ROUTING_ID = 'meta-app-route-1';
    expect(
      buildProviderWebhookUrl({
        baseUrl: 'https://hooks.example.com/',
        provider: 'messenger',
        channelId,
      }),
    ).toBe('https://hooks.example.com/webhooks/messenger/meta-app-route-1');
    delete process.env.META_PROVIDER_APP_ROUTING_ID;
  });

  it('resolves two different tenant messenger channels to the same webhook URL', () => {
    process.env.MESSENGER_PROVIDER_APP_ROUTING_ID = 'shared';
    const first = buildProviderWebhookUrl({
      baseUrl: 'https://hooks.example.com/',
      provider: 'messenger',
      channelId: '11111111-1111-4111-8111-111111111111',
    });
    const second = buildProviderWebhookUrl({
      baseUrl: 'https://hooks.example.com/',
      provider: 'messenger',
      channelId: '22222222-2222-4222-8222-222222222222',
    });
    expect(first).toBe(second);
    delete process.env.MESSENGER_PROVIDER_APP_ROUTING_ID;
  });

  it('normalizes trailing slashes consistently', () => {
    expect(
      buildProviderWebhookUrl({
        baseUrl: 'https://hooks.example.com////',
        provider: 'telegram',
        channelId,
      }),
    ).toBe(`https://hooks.example.com/webhooks/telegram/${channelId}`);
  });

  it('rejects unsupported providers', () => {
    expect(() =>
      buildProviderWebhookUrl({
        baseUrl: 'https://hooks.example.com',
        provider: 'unknown',
        channelId,
      }),
    ).toThrow('Unsupported webhook provider');
  });

  it('rejects invalid public base URLs', () => {
    expect(() =>
      buildProviderWebhookUrl({
        baseUrl: 'not a url',
        provider: 'telegram',
        channelId,
      }),
    ).toThrow('valid absolute URL');
  });

  it('requires HTTPS in production', () => {
    expect(() =>
      buildProviderWebhookUrl({
        baseUrl: 'http://hooks.example.com',
        provider: 'telegram',
        channelId,
        nodeEnv: 'production',
      }),
    ).toThrow('HTTPS');
  });

  it('still rejects name or slug route identifiers for non-messenger providers', () => {
    expect(() =>
      buildProviderWebhookUrl({
        baseUrl: 'https://hooks.example.com',
        provider: 'telegram',
        channelId: 'merchant-main-channel',
      }),
    ).toThrow('persisted channel UUID');
  });
});
