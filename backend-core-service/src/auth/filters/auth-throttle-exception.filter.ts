import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

/**
 * Maps rate-limit rejections on auth endpoints to the standard error
 * contract (`code: RATE_LIMITED` + user-facing copy) instead of the
 * default throttler body.
 */
@Catch(ThrottlerException)
export class AuthThrottleExceptionFilter implements ExceptionFilter {
  catch(_exception: ThrottlerException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    response.status(HttpStatus.TOO_MANY_REQUESTS).json({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Too many attempts. Please try again in a minute.',
      code: 'RATE_LIMITED',
    });
  }
}
