import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PlatformAdmin } from './entities/platform-admin.entity';
import { TenantUser } from './entities/tenant-user.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { TenantPolicyConsent } from './entities/tenant-policy-consent.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SubscriptionPlan } from '../tenant/entities/subscription-plan.entity';
import { TenantBillingRecord } from '../platform-admin/entities/tenant-billing-record.entity';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { LegalPolicyModule } from '../legal-policy/legal-policy.module';
import { MediaModule } from '../media/media.module';
import { SubscriptionPeriodModule } from '../subscription-period/subscription-period.module';
import { OtpModule } from './otp.module';
import { LoggingModule } from '../logging/logging.module';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshJwtStrategy } from './strategies/refresh-jwt.strategy';
import { WebSocketModule } from '../websocket/websocket.module';
import { FeatureToggleModule } from '../feature-toggle/feature-toggle.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlatformAdmin,
      TenantUser,
      Tenant,
      PasswordResetToken,
      EmailVerificationToken,
      TenantPolicyConsent,
      SubscriptionPlan,
      TenantBillingRecord,
    ]),
    EntitlementModule,
    LegalPolicyModule,
    MediaModule,
    SubscriptionPeriodModule,
    OtpModule,
    LoggingModule,
    FeatureToggleModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('auth.jwtSecret'),
        signOptions: {
          expiresIn: configService.get<string>('auth.jwtExpiresIn'),
        },
      }),
      inject: [ConfigService],
    }),
    forwardRef(() => WebSocketModule),
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy, RefreshJwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
