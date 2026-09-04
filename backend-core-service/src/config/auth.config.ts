import { registerAs } from '@nestjs/config';
import { assertSafeSecret, MINIMUM_JWT_SECRET_LENGTH } from './secret-policy';

export const authConfig = registerAs('auth', () => {
  const jwtSecret = process.env.JWT_SECRET?.trim();
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET?.trim() || jwtSecret;

  assertSafeSecret(jwtSecret, {
    envVarName: 'JWT_SECRET',
    minimumLength: MINIMUM_JWT_SECRET_LENGTH,
  });
  assertSafeSecret(jwtRefreshSecret, {
    envVarName: process.env.JWT_REFRESH_SECRET?.trim()
      ? 'JWT_REFRESH_SECRET'
      : 'JWT_SECRET',
    minimumLength: MINIMUM_JWT_SECRET_LENGTH,
  });

  return {
    jwtSecret,
    jwtRefreshSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    bcryptRounds: Number.parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  };
});
