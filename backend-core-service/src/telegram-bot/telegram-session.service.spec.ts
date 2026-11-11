import { Test } from '@nestjs/testing';
import { TelegramSessionService } from './telegram-session.service';
import { telegramRedisProvider } from './telegram-bot.module';
import { REDIS_CLIENT } from './telegram-session.service';

describe('TelegramSessionService', () => {
  it('resolves through the TelegramBotModule Redis provider', async () => {
    const client = {
      connect: jest.fn(),
      quit: jest.fn().mockResolvedValue('OK'),
      hGetAll: jest.fn(),
      eval: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [TelegramSessionService, telegramRedisProvider],
    })
      .overrideProvider(REDIS_CLIENT)
      .useValue(client)
      .compile();

    expect(module.get(TelegramSessionService)).toBeInstanceOf(
      TelegramSessionService,
    );
    await module.close();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it('allows only one of two concurrent compare-and-set updates', async () => {
    let version = '1';
    const client = {
      eval: jest.fn((_script: string, options: { arguments: string[] }) => {
        if (options.arguments[0] !== version) return Promise.resolve(0);
        version = options.arguments[1];
        return Promise.resolve(1);
      }),
      connect: jest.fn(),
      quit: jest.fn(),
      hGetAll: jest.fn(),
    };
    const service = new TelegramSessionService(client);
    const update = {
      tenantId: 'tenant',
      channelId: 'channel',
      userId: 'user',
      chatId: 'chat',
    };
    const next = { version: 2, state: 'catalog', data: { page: 2 } };

    await expect(
      Promise.all([
        service.compareAndSet(update, 1, next),
        service.compareAndSet(update, 1, next),
      ]),
    ).resolves.toEqual([expect.objectContaining({ version: 2 }), null]);
  });
});
