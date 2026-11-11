import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

export const INVALID_CREDENTIALS_MESSAGE =
  'Incorrect email or password. Please try again.';
export const INVALID_CREDENTIALS_CODE = 'INVALID_CREDENTIALS';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'email',
    });
  }

  async validate(email: string, password: string): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const user = await this.authService.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: INVALID_CREDENTIALS_MESSAGE,
        code: INVALID_CREDENTIALS_CODE,
      });
    }
    return user;
  }
}
