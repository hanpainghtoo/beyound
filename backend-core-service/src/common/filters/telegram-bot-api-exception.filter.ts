import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { TelegramBotApiError } from '../../channel/telegram-bot-api.client';

@Catch(TelegramBotApiError)
export class TelegramBotApiExceptionFilter implements ExceptionFilter {
  catch(exception: TelegramBotApiError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = this.mapStatus(exception.code);
    const retryAfter = exception.safeDetails.retryAfterSeconds;

    response.status(status).json({
      statusCode: status,
      error: exception.code,
      message: exception.safeDetails.description || exception.message,
      ...(retryAfter ? { retryAfterSeconds: retryAfter } : {}),
    });
  }

  private mapStatus(code: string): number {
    switch (code) {
      case 'invalid_credentials':
        return HttpStatus.UNAUTHORIZED;
      case 'rate_limited':
        return HttpStatus.TOO_MANY_REQUESTS;
      case 'provider_unavailable':
      case 'network_timeout':
        return HttpStatus.SERVICE_UNAVAILABLE;
      case 'provider_rejected_request':
      case 'managed_bot_token_missing':
      case 'managed_bot_missing':
      case 'managed_bot_identity_mismatch':
      case 'invalid_bot_token':
      case 'invalid_webhook_url':
      case 'webhook_registration_failed':
      case 'webhook_delete_failed':
      case 'telegram_manager_bot_token_missing':
      case 'telegram_manager_message_failed':
        return HttpStatus.BAD_REQUEST;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }
}
