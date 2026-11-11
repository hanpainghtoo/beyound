import { AppDataSource } from '../src/database/data-source';
import { TenantChannel } from '../src/channel/entities/tenant-channel.entity';
import { TenantChannelSettings } from '../src/tenant/entities/tenant-channel-settings.entity';

function readRequiredArg(name: string) {
  const prefix = `--${name}=`;
  const value = process.argv
    .slice(2)
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
  if (!value) throw new Error(`--${name}=... is required`);
  return value;
}

async function main() {
  const channelId = readRequiredArg('channel');
  const enabledValue = readRequiredArg('enabled').toLowerCase();
  const orderingArg = process.argv
    .slice(2)
    .find((arg) => arg.startsWith('--ordering-enabled='));
  const orderingValue = orderingArg
    ?.slice('--ordering-enabled='.length)
    .toLowerCase();
  const dryRun = process.argv.slice(2).includes('--dry-run');
  if (!['true', 'false'].includes(enabledValue))
    throw new Error('--enabled must be true or false');
  if (orderingValue && !['true', 'false'].includes(orderingValue))
    throw new Error('--ordering-enabled must be true or false');

  await AppDataSource.initialize();
  try {
    const repository = AppDataSource.getRepository(TenantChannel);
    const channel = await repository.findOneBy({ id: channelId });
    if (!channel) throw new Error(`Channel not found: ${channelId}`);
    if (channel.channelType !== 'telegram')
      throw new Error(`Channel is not Telegram: ${channelId}`);

    const configuration = (channel.configuration || {}) as Record<
      string,
      unknown
    >;
    const telegramShopping = (configuration.telegramShopping || {}) as Record<
      string,
      unknown
    >;
    const templateSettings = await AppDataSource.getRepository(
      TenantChannelSettings,
    ).findOne({ where: { tenantId: channel.tenantId } });
    const templateEnabled =
      templateSettings?.telegramBotTemplate === 'commerce';
    const enablingShop = enabledValue === 'true';
    const templateWarning =
      enablingShop && !templateEnabled
        ? `Tenant ${channel.tenantId} has no Telegram bot template enabled; shopEnabled will have no effect until the tenant's Telegram bot template is enabled in platform-console.`
        : undefined;
    if (templateWarning) {
      console.error(`WARNING: ${templateWarning}`);
    }
    channel.configuration = {
      ...configuration,
      telegramShopping: {
        ...telegramShopping,
        shopEnabled: enabledValue === 'true',
        ...(orderingValue ? { orderingEnabled: orderingValue === 'true' } : {}),
      },
    };
    if (!dryRun) await repository.save(channel);
    console.log(
      JSON.stringify({
        event: 'telegram_shop_setting_updated',
        channelId,
        tenantId: channel.tenantId,
        shopEnabled: enabledValue === 'true',
        ...(orderingValue ? { orderingEnabled: orderingValue === 'true' } : {}),
        templateEnabled,
        ...(templateWarning ? { templateWarning } : {}),
        dryRun,
        status: dryRun ? 'would_update' : 'updated',
      }),
    );
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) void main();
