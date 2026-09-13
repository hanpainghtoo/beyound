import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  ChannelAdapter,
  ChannelAdapterSendInput,
} from './channel-adapter.types';
import { InternalChannelAdapter } from './internal-channel.adapter';
import { ProviderChannelAdapter } from './provider-channel.adapter';
import { TenantChannel } from '../channel/entities/tenant-channel.entity';
import { decryptProviderCredentials } from '../channel/provider-credentials.util';

@Injectable()
export class ChannelAdapterService {
  private adapters: Map<string, ChannelAdapter>;

  constructor(
    @InjectRepository(TenantChannel)
    private readonly channelRepository: Repository<TenantChannel>,
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

    const credentials = channel
      ? decryptProviderCredentials(
          channel.credentials,
          this.getCredentialSecret(),
        )
      : {};

    return adapter.sendMessage({ ...input, credentials });
  }

  private getCredentialSecret() {
    const secret =
      process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET;
    if (!secret) {
      throw new Error(
        'PROVIDER_CREDENTIAL_ENCRYPTION_KEY or JWT_SECRET is required',
      );
    }
    return secret;
  }
}
