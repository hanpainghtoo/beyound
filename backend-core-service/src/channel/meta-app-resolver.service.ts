import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { MetaApp } from './entities/meta-app.entity';
import {
  TenantChannelSettingsService,
  FACEBOOK_MODE_BYO,
} from '../tenant/tenant-channel-settings.service';
import {
  encryptProviderCredentials,
  decryptProviderCredentials,
} from './provider-credentials.util';

@Injectable()
export class MetaAppResolver implements OnApplicationBootstrap {
  private readonly logger = new Logger(MetaAppResolver.name);
  constructor(
    @InjectRepository(MetaApp) private readonly repository: Repository<MetaApp>,
    private readonly settings: TenantChannelSettingsService,
  ) {}
  async onApplicationBootstrap() {
    await this.ensurePlatformApp();
  }
  private credentialSecret() {
    const secret =
      process.env.PROVIDER_CREDENTIAL_ENCRYPTION_KEY ||
      process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY ||
      process.env.JWT_SECRET;
    if (!secret)
      throw new Error('Provider credential encryption key is not configured');
    return secret;
  }
  async ensurePlatformApp() {
    const appId = process.env.META_APP_ID;
    const appSecret =
      process.env.META_APP_SECRET || process.env.MESSENGER_APP_SECRET;
    const verifyToken =
      process.env.META_WEBHOOK_VERIFY_TOKEN ||
      process.env.MESSENGER_VERIFY_TOKEN;
    const segment =
      process.env.META_PROVIDER_APP_ROUTING_ID ||
      process.env.MESSENGER_PROVIDER_APP_ROUTING_ID;
    if (!appId || !appSecret || !verifyToken || !segment) {
      const missing: string[] = [];
      if (!appId) missing.push('META_APP_ID');
      if (!appSecret) missing.push('META_APP_SECRET (or MESSENGER_APP_SECRET)');
      if (!verifyToken)
        missing.push('META_WEBHOOK_VERIFY_TOKEN (or MESSENGER_VERIFY_TOKEN)');
      if (!segment)
        missing.push(
          'META_PROVIDER_APP_ROUTING_ID (or MESSENGER_PROVIDER_APP_ROUTING_ID)',
        );
      this.logger.warn(
        `Skipping platform Meta app seed; missing ${missing.join(', ')}`,
      );
      return null;
    }
    let row = await this.repository.findOne({ where: { kind: 'platform' } });
    const encSecret = encryptProviderCredentials(
      { value: appSecret },
      this.credentialSecret(),
    );
    const encVerify = encryptProviderCredentials(
      { value: verifyToken },
      this.credentialSecret(),
    );
    if (!row)
      row = this.repository.create({
        kind: 'platform',
        tenantId: null,
        appId,
        webhookPathSegment: segment,
        status: 'valid',
        loginConfigId: null,
        lastValidatedAt: new Date(),
        appSecretEncrypted: encSecret,
        verifyTokenEncrypted: encVerify,
      });
    else {
      row.appId = appId;
      row.webhookPathSegment = segment;
      row.appSecretEncrypted = encSecret;
      row.verifyTokenEncrypted = encVerify;
    }
    return this.repository.save(row);
  }
  async getMetaApp(tenantId: string) {
    const { facebookMode } = await this.settings.getFacebookSettings(tenantId);
    if (facebookMode === FACEBOOK_MODE_BYO) {
      const byo = await this.repository.findOne({
        where: { tenantId, kind: 'byo' },
      });
      if (!byo || byo.status !== 'valid' || byo.liveConfirmedAt == null)
        throw new NotFoundException('BYO_APP_NOT_CONFIGURED');
      return byo;
    }
    const platform = await this.repository.findOne({
      where: { kind: 'platform' },
    });
    if (!platform)
      throw new NotFoundException('Platform Meta app is not configured');
    return platform;
  }
  async resolveByPathSegment(segment: string) {
    const row = await this.repository.findOne({
      where: { webhookPathSegment: segment },
    });
    if (!row || row.status === 'retired')
      throw new NotFoundException('Webhook route not found');
    return row;
  }
  decrypt(row: MetaApp): { appSecret: string; verifyToken: string } {
    const secret = this.credentialSecret();
    const appCredentials = decryptProviderCredentials(
      row.appSecretEncrypted,
      secret,
    );
    const verifyCredentials = decryptProviderCredentials(
      row.verifyTokenEncrypted,
      secret,
    );
    return {
      appSecret: appCredentials.value as string,
      verifyToken: verifyCredentials.value as string,
    };
  }
  newVerifyToken() {
    return randomBytes(32).toString('hex');
  }
  newWebhookPathSegment() {
    return `t_${randomBytes(18).toString('base64url')}`;
  }
}
