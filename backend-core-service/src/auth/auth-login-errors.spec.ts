import { HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { validate } from 'class-validator';

import { LoginDto } from './dto/login.dto';
import { AuthThrottleExceptionFilter } from './filters/auth-throttle-exception.filter';
import {
  INVALID_CREDENTIALS_CODE,
  INVALID_CREDENTIALS_MESSAGE,
  LocalStrategy,
} from './strategies/local.strategy';

function validationMessages(
  errors: Array<{ constraints?: Record<string, string> }>,
) {
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('Auth login error contract', () => {
  it('rejects unknown users and wrong passwords with the same 401 body', async () => {
    const strategy = new LocalStrategy({
      validateUser: jest.fn().mockResolvedValue(null),
    } as any);

    for (const [email, password] of [
      ['unknown@example.com', 'Password123!'],
      ['agent@example.com', 'WrongPassword123!'],
    ]) {
      try {
        await strategy.validate(email, password);
        fail(`expected validate to reject for ${email}`);
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect((error as UnauthorizedException).getResponse()).toEqual({
          statusCode: HttpStatus.UNAUTHORIZED,
          message: INVALID_CREDENTIALS_MESSAGE,
          code: INVALID_CREDENTIALS_CODE,
        });
      }
    }
  });

  it('returns the authenticated user on valid credentials', async () => {
    const user = { id: 'user-1', type: 'tenant_user' };
    const strategy = new LocalStrategy({
      validateUser: jest.fn().mockResolvedValue(user),
    } as any);

    await expect(
      strategy.validate('agent@example.com', 'Password123!'),
    ).resolves.toBe(user);
  });

  it('reports friendly field messages for invalid login input', async () => {
    const dto = new LoginDto();
    dto.email = 'not-an-email';
    dto.password = 'short';

    expect(validationMessages(await validate(dto))).toEqual(
      expect.arrayContaining([
        'Enter a valid email address.',
        'Password must be at least 6 characters.',
      ]),
    );

    const empty = new LoginDto();
    empty.email = '';
    empty.password = '';
    expect(validationMessages(await validate(empty))).toEqual(
      expect.arrayContaining([
        'Enter your email address.',
        'Password must be at least 6 characters.',
      ]),
    );
  });

  it('maps throttled auth attempts to the RATE_LIMITED body', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const filter = new AuthThrottleExceptionFilter();

    filter.catch(new ThrottlerException(), {
      switchToHttp: () => ({ getResponse: () => ({ status, json }) }),
    } as any);

    expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Too many attempts. Please try again in a minute.',
      code: 'RATE_LIMITED',
    });
  });
});
