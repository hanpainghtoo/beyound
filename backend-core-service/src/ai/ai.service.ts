import { Injectable } from '@nestjs/common';

export type AiSummaryResult = {
  enabled: boolean;
  summary: string | null;
  provider: string;
};

export type AiIntentResult = {
  enabled: boolean;
  intent: string | null;
  confidence: number;
  provider: string;
};

@Injectable()
export class AiService {
  isEnabledForTenant(settings?: Record<string, any> | null): boolean {
    return Boolean(settings?.ai?.enabled);
  }

  async summarizeMessages(
    tenantSettings: Record<string, any> | null,
    messages: string[],
  ): Promise<AiSummaryResult> {
    if (!this.isEnabledForTenant(tenantSettings)) {
      return { enabled: false, summary: null, provider: 'disabled' };
    }

    return {
      enabled: true,
      summary:
        messages.filter(Boolean).slice(-5).join(' ').slice(0, 500) || null,
      provider: tenantSettings?.ai?.provider || 'noop',
    };
  }

  async classifyIntent(
    tenantSettings: Record<string, any> | null,
    message: string,
  ): Promise<AiIntentResult> {
    if (!this.isEnabledForTenant(tenantSettings)) {
      return {
        enabled: false,
        intent: null,
        confidence: 0,
        provider: 'disabled',
      };
    }

    const normalizedMessage = message.toLowerCase();
    let intent = 'general';
    if (
      normalizedMessage.includes('price') ||
      normalizedMessage.includes('ဘယ်လောက်')
    )
      intent = 'price_inquiry';
    if (
      normalizedMessage.includes('delivery') ||
      normalizedMessage.includes('ပို့')
    )
      intent = 'delivery_question';
    if (
      normalizedMessage.includes('order') ||
      normalizedMessage.includes('မှာ')
    )
      intent = 'order_inquiry';

    return {
      enabled: true,
      intent,
      confidence: intent === 'general' ? 0.35 : 0.6,
      provider: tenantSettings?.ai?.provider || 'noop',
    };
  }
}
