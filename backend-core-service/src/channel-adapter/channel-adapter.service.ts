import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  ChannelAdapter,
  ChannelAdapterSendInput,
} from './channel-adapter.types';
import { InternalChannelAdapter } from './internal-channel.adapter';
import { ProviderChannelAdapter } from './provider-channel.adapter';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { Customer } from '../customer/entities/customer.entity';
import { decryptProviderCredentials } from '../channel/provider-credentials.util';

@Injectable()
export class ChannelAdapterService {
  private readonly logger = new Logger(ChannelAdapterService.name);
  private adapters: Map<string, ChannelAdapter>;

  constructor(
    @InjectRepository(TenantChannel)
    private readonly channelRepository: Repository<TenantChannel>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {
    const internalAdapter = new InternalChannelAdapter();
    const telegramAdapter = new ProviderChannelAdapter('telegram');
    const messengerAdapter = new ProviderChannelAdapter('messenger');
    const tikTokAdapter = new ProviderChannelAdapter('tiktok');
    this.adapters = new Map<string, ChannelAdapter>([
      [internalAdapter.type, internalAdapter],
      ['messenger', messengerAdapter],
      ['telegram', telegramAdapter],
      ['viber', internalAdapter],
      ['tiktok', tikTokAdapter],
    ]);
  }

  getAdapter(channelType?: string): ChannelAdapter {
    return (
      this.adapters.get(channelType || 'internal') ||
      new InternalChannelAdapter()
    );
  }

  async validateConfig(
    channelType: string,
    configuration: Record<string, any>,
    credentials?: Record<string, any>,
  ) {
    return this.getAdapter(channelType).validateConfig(
      configuration,
      credentials,
    );
  }

  async sendMessage(channelType: string, input: ChannelAdapterSendInput) {
    const adapter = this.getAdapter(channelType);
    const channel = await this.channelRepository.findOne({
      where: { id: input.channelId },
    });
    if (
      channel &&
      (channel.status === 'disabled' ||
        channel.status === 'inactive' ||
        channel.connectionStatus === 'disabled')
    ) {
      throw new ConflictException({
        code: 'CHANNEL_DISABLED',
        message: 'This channel is disabled and cannot send provider traffic.',
        channelId: channel.id,
      });
    }
    if (adapter.type === 'internal') {
      return adapter.sendMessage(input);
    }

    const customer =
      adapter.type === 'telegram' && input.recipientId
        ? await this.customerRepository.findOne({
            where: {
              channelId: input.channelId,
              provider: 'telegram',
              externalId: input.recipientId,
            },
          })
        : null;
    if (customer?.botBlockedAt) {
      this.logger.warn(
        `Skipping Telegram send to blocked customer ${customer.id} on channel ${input.channelId}`,
      );
      return {
        status: 'failed' as const,
        metadata: {
          provider: 'telegram',
          providerStatus: 'customer_bot_blocked',
          error: 'Customer has blocked the bot.',
          retry: { recommended: false },
          skipped: true,
        },
      };
    }

    const credentials = channel
      ? decryptProviderCredentials(
          channel.credentials,
          this.getCredentialSecret(),
        )
      : {};

    const result = await adapter.sendMessage({ ...input, credentials });
    if (
      adapter.type === 'telegram' &&
      this.isCustomerBlockedResult(result.metadata)
    ) {
      await this.customerRepository.update(
        {
          channelId: input.channelId,
          provider: 'telegram',
          externalId: input.recipientId,
        },
        {
          botBlockedAt: new Date(),
          botBlockedReason: this.blockReason(result.metadata),
        },
      );
    }
    return result;
  }

  private getCredentialSecret() {
    const secret =
      process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY ||
      process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY;
    if (!secret) {
      throw new Error(
        'PROVIDER_CREDENTIAL_ENCRYPTION_KEY or TELEGRAM_TOKEN_ENCRYPTION_KEY is required',
      );
    }
    return secret;
  }

  private isCustomerBlockedResult(metadata?: Record<string, unknown>) {
    if (metadata?.providerStatus !== 'forbidden') return false;
    const providerError = metadata.providerError;
    if (!providerError || typeof providerError !== 'object') return false;
    const code =
      'code' in providerError && typeof providerError.code === 'string'
        ? providerError.code
        : '';
    return code === 'bot_blocked' || code === 'user_deactivated';
  }

  private blockReason(metadata?: Record<string, unknown>) {
    const providerError = metadata?.providerError;
    if (
      providerError &&
      typeof providerError === 'object' &&
      'code' in providerError &&
      typeof providerError.code === 'string'
    ) {
      return providerError.code;
    }
    return 'telegram_user_blocked';
  }
}
