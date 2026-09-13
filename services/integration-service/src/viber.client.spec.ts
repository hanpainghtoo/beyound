import { ViberClient } from './viber.client';

describe('ViberClient', () => {
  it('sends text through the Viber Business Messages API', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify({ status: 0, message_token: 42 }), { status: 200 }));
    const client = new ViberClient('https://viber.test/pa', fetcher);
    const result = await client.send({ channelId: 'channel-1', recipientId: 'user-1', content: 'Mingalaba', credentials: { authToken: 'secret', botName: 'Shop' } });
    expect(result).toMatchObject({ accepted: true, provider: 'viber', externalMessageId: '42', status: 'sent' });
    expect(fetcher).toHaveBeenCalledWith('https://viber.test/pa/send_message', expect.objectContaining({
      headers: expect.objectContaining({ 'X-Viber-Auth-Token': 'secret' }),
      body: expect.stringContaining('Mingalaba'),
    }));
  });

  it('returns validation errors without calling Viber', async () => {
    const fetcher = jest.fn();
    const result = await new ViberClient('https://viber.test/pa', fetcher).send({ channelId: 'channel-1', content: '' });
    expect(result).toMatchObject({ accepted: false, status: 'validation_error' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('surfaces provider errors and retry hints', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify({ status: 1, status_message: 'invalid token' }), { status: 503 }));
    const result = await new ViberClient('https://viber.test/pa', fetcher).send({ channelId: 'channel-1', recipientId: 'user-1', content: 'Hi', credentials: { authToken: 'bad' } });
    expect(result).toMatchObject({ accepted: false, status: 'provider_error', retry: { recommended: true } });
  });
});
