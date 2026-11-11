import { ViberWebhookClient } from './viber-webhook.client';

describe('ViberWebhookClient', () => {
  it('registers an HTTPS webhook', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify({ status: 0, status_message: 'ok', event_types: ['delivered'] }), { status: 200 }));
    const result = await new ViberWebhookClient('https://viber.test/pa', fetcher).register('channel-1', { authToken: 'secret', webhookUrl: 'https://example.com/webhooks/viber/channel-1' });
    expect(result).toMatchObject({ accepted: true, status: 'registered' });
  });

  it('rejects non-HTTPS webhook URLs', async () => {
    const fetcher = jest.fn();
    const result = await new ViberWebhookClient('https://viber.test/pa', fetcher).register('channel-1', { authToken: 'secret', webhookUrl: 'http://localhost/hook' });
    expect(result).toMatchObject({ accepted: false, status: 'validation_error' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
