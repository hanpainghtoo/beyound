import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  it('keeps core endpoints operational when Telegram manager is degraded', async () => {
    const dataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const telegramManagedBotService = {
      getManagerReadiness: jest.fn(() => ({
        status: 'misconfigured',
        ready: false,
        code: 'TELEGRAM_MANAGER_BOT_MANAGEMENT_DISABLED',
        message:
          'Telegram bot management is not enabled for @ZayOSManagerBot. Enable management of other bots in the BotFather Mini App.',
        checkedAt: new Date().toISOString(),
      })),
    };
    const service = new AppService(
      dataSource as never,
      undefined,
      telegramManagedBotService as never,
    );
    const controller = new AppController(service);

    expect(controller.getHello()).toBe('Hello World!');
    expect(service.getHealth()).toMatchObject({
      status: 'ok',
      telegramManager: {
        status: 'misconfigured',
        ready: false,
      },
    });
    await expect(controller.getReadiness()).resolves.toMatchObject({
      ready: true,
      dependencies: {
        telegramManager: {
          status: 'misconfigured',
          ready: false,
        },
      },
    });
  });
});
