export type ViberWebhookRegistrationInput = {
  authToken?: string;
  webhookUrl?: string;
  eventTypes?: string[];
  sendName?: boolean;
  sendPhoto?: boolean;
};

type ViberResponse = { status?: number; status_message?: string; event_types?: string[] };

export class ViberWebhookClient {
  constructor(
    private readonly apiBaseUrl = process.env.VIBER_API_BASE_URL || 'https://chatapi.viber.com/pa',
    private readonly fetcher?: typeof fetch,
  ) {}

  register(channelId: string, input: ViberWebhookRegistrationInput) {
    return this.setWebhook(channelId, input, input.webhookUrl);
  }

  unregister(channelId: string, input: ViberWebhookRegistrationInput) {
    return this.setWebhook(channelId, input, '');
  }

  private async setWebhook(channelId: string, input: ViberWebhookRegistrationInput, url?: string) {
    if (!input.authToken?.trim()) return this.validationError(channelId, 'authToken is required');
    if (url === undefined || (url !== '' && !/^https:\/\//i.test(url))) {
      return this.validationError(channelId, 'webhookUrl must use HTTPS');
    }
    try {
      const response = await (this.fetcher || fetch)(`${this.apiBaseUrl.replace(/\/$/, '')}/set_webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Viber-Auth-Token': input.authToken.trim() },
        body: JSON.stringify({
          url,
          event_types: input.eventTypes || ['delivered', 'seen', 'failed', 'subscribed', 'unsubscribed', 'conversation_started'],
          send_name: input.sendName ?? true,
          send_photo: input.sendPhoto ?? true,
        }),
      });
      const body = (await response.json()) as ViberResponse;
      return {
        accepted: response.ok && body.status === 0,
        provider: 'viber' as const,
        channelId,
        status: response.ok && body.status === 0 ? (url ? 'registered' : 'unregistered') : 'provider_error',
        providerStatus: body.status,
        providerMessage: body.status_message,
        eventTypes: body.event_types || input.eventTypes,
      };
    } catch (error) {
      return { accepted: false, provider: 'viber' as const, channelId, status: 'provider_unavailable', error: error instanceof Error ? error.message : String(error) };
    }
  }

  private validationError(channelId: string, error: string) {
    return { accepted: false, provider: 'viber' as const, channelId, status: 'validation_error', errors: [error] };
  }
}
