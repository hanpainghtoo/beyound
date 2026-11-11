import { BadRequestException, Injectable } from '@nestjs/common';
import {
  TELEGRAM_CALLBACK_MAX_BYTES,
  decodeTelegramCallbackId,
  type TelegramBotUpdate,
  type TelegramCallback,
} from './telegram-bot.types';
import { TelegramSessionService } from './telegram-session.service';

const ROOT_MENU_ACTIONS = new Set(['p', 'f', 'o', 'a', 'm', 'b']);

@Injectable()
export class TelegramBotRouter {
  constructor(private readonly sessions: TelegramSessionService) {}

  assertPrivateChat(update: TelegramBotUpdate) {
    if (update.chatType && update.chatType !== 'private') {
      throw new BadRequestException(
        'Telegram shopping bot supports private chats only.',
      );
    }
  }

  parseCallback(data: string): TelegramCallback {
    if (Buffer.byteLength(data, 'utf8') > TELEGRAM_CALLBACK_MAX_BYTES) {
      throw new BadRequestException(
        'Telegram callback payload exceeds 64 bytes.',
      );
    }
    const [action, idValue, pageValue, versionValue] = data.split(':');
    if (!action || !/^[a-z][a-z0-9_]{0,23}$/.test(action)) {
      throw new BadRequestException('Invalid Telegram callback action.');
    }
    const page = pageValue === undefined ? undefined : Number(pageValue);
    if (
      pageValue !== undefined &&
      (page === undefined || !Number.isInteger(page) || page < 0)
    ) {
      throw new BadRequestException('Invalid Telegram callback page.');
    }
    const version =
      versionValue === undefined ? undefined : Number(versionValue);
    if (
      versionValue !== undefined &&
      (!Number.isInteger(version) || (version as number) < 0)
    ) {
      throw new BadRequestException('Invalid Telegram callback version.');
    }
    return {
      action,
      id: decodeTelegramCallbackId(idValue),
      page,
      ...(version === undefined ? {} : { version }),
    };
  }

  async routeCallback(
    update: TelegramBotUpdate,
    expectedState: string,
    expectedVersion: number,
  ) {
    this.assertPrivateChat(update);
    if (!update.callbackData) {
      return {
        accepted: false as const,
        reason: 'bad_payload' as const,
        callback: undefined,
      };
    }
    let callback: TelegramCallback;
    try {
      callback = this.parseCallback(update.callbackData);
    } catch {
      return {
        accepted: false as const,
        reason: 'bad_payload' as const,
        callback: undefined,
      };
    }
    const session = await this.sessions.get(update);
    if (ROOT_MENU_ACTIONS.has(callback.action)) {
      return { accepted: true as const, callback, session };
    }
    if (!session) {
      return {
        accepted: false as const,
        reason: 'missing_session' as const,
        callback,
        session,
      };
    }
    if (
      session.state !== expectedState ||
      session.version !== expectedVersion ||
      (callback.version !== undefined && callback.version !== expectedVersion)
    ) {
      return {
        accepted: false as const,
        reason: 'version_mismatch' as const,
        callback,
        session,
      };
    }
    return { accepted: true as const, callback, session };
  }
}
