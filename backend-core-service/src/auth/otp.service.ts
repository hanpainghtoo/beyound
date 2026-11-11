import {
  Injectable,
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan } from 'typeorm';
import type { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { Otp, type OtpPurpose } from './entities/otp.entity';
import { EmailService } from '../email/email.service';
import { resolvePublicBaseUrl } from '../config/public-base-url';

export const OTP_EXPIRY_SECONDS = 10 * 60;
export const EMAIL_VERIFICATION_EXPIRY_SECONDS = 120;
const OTP_MAX_ATTEMPTS = 3;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 120;

export type OtpGenerationResult = {
  message: string;
  expiresAt: string;
  resendAvailableAt: string;
  expiresInSeconds: number;
};

export function getOtpExpirySeconds(purpose: OtpPurpose): number {
  return purpose === 'email_verification'
    ? EMAIL_VERIFICATION_EXPIRY_SECONDS
    : OTP_EXPIRY_SECONDS;
}

function getResendCooldownSeconds(purpose: OtpPurpose): number {
  return purpose === 'email_verification'
    ? EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS
    : OTP_RESEND_COOLDOWN_SECONDS;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectRepository(Otp)
    private readonly otpRepository: Repository<Otp>,
    private readonly emailService: EmailService,
  ) {}

  async generate(
    email: string,
    purpose: OtpPurpose,
    metadata?: Record<string, any>,
  ): Promise<OtpGenerationResult> {
    const normalizedEmail = email.trim().toLowerCase();

    await this.expireOldOtps(normalizedEmail, purpose);
    await this.enforceResendCooldown(normalizedEmail, purpose);

    const code = String(randomInt(100000, 999999));
    const codeHash = await bcrypt.hash(code, 10);
    const now = new Date();
    const expiresInSeconds = getOtpExpirySeconds(purpose);
    const expiresAt = new Date(now.getTime() + expiresInSeconds * 1_000);
    const resendAvailableAt = new Date(
      now.getTime() + getResendCooldownSeconds(purpose) * 1_000,
    );

    const otp = await this.otpRepository.save(
      this.otpRepository.create({
        normalizedEmail,
        codeHash,
        purpose,
        expiresAt,
        attemptCount: 0,
        maxAttempts: OTP_MAX_ATTEMPTS,
        usedAt: null,
        resendAvailableAt,
        metadata: metadata || {},
      }),
    );

    const purposeLabel =
      purpose === 'pricing_registration'
        ? 'complete your registration'
        : purpose === 'email_verification'
          ? 'verify your email address'
          : 'sign in';
    try {
      const sent = await this.emailService.sendOtpEmail(normalizedEmail, {
        code,
        expiresAt,
        purpose: purposeLabel,
        verifyUrl: this.buildEmailVerificationLink(normalizedEmail, code),
      });

      if (sent !== true) {
        throw new Error('Email service did not confirm delivery.');
      }
      this.logger.log(`OTP email sent to ${normalizedEmail} (${purpose})`);
    } catch (error) {
      // Keep the record for auditability, but make it inactive so a resend can
      // proceed immediately after SMTP is fixed instead of hitting cooldown.
      otp.usedAt = new Date();
      await this.otpRepository.save(otp);
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `OTP email failed for ${normalizedEmail} (${purpose}): ${reason}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'OTP email failed to send. Please try resending the code.',
      );
    }

    return {
      message: 'If an account exists, a verification code has been sent.',
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: resendAvailableAt.toISOString(),
      expiresInSeconds,
    };
  }

  async verify(
    email: string,
    code: string,
    purpose: OtpPurpose,
  ): Promise<{ valid: true; email: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    const activeOtp = await this.otpRepository.findOne({
      where: {
        normalizedEmail,
        purpose,
        usedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    if (!activeOtp) {
      throw new BadRequestException(
        'No active verification code found. Please request a new one.',
      );
    }

    if (activeOtp.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        purpose === 'email_verification'
          ? 'OTP expired. Please request a new code.'
          : 'Verification code has expired. Please request a new one.',
      );
    }

    if (activeOtp.attemptCount >= activeOtp.maxAttempts) {
      throw new BadRequestException(
        'Too many failed attempts. Please request a new verification code.',
      );
    }

    const codeValid = await bcrypt.compare(code, activeOtp.codeHash);
    if (!codeValid) {
      activeOtp.attemptCount += 1;
      await this.otpRepository.save(activeOtp);
      throw new BadRequestException('Invalid verification code.');
    }

    activeOtp.usedAt = new Date();
    await this.otpRepository.save(activeOtp);

    return { valid: true, email: normalizedEmail };
  }

  private buildEmailVerificationLink(
    normalizedEmail: string,
    code: string,
  ): string | undefined {
    // Best-effort deep link for the "Verify my email" button: the
    // verify-email page prefills the code and attempts one auto-submit,
    // falling back to manual entry. Never let a missing/invalid base URL
    // break OTP delivery.
    try {
      const baseUrl = resolvePublicBaseUrl(
        process.env,
        'WORKSPACE_PUBLIC_APP_URL',
        { allowMissingInDevelopment: true },
      );
      if (!baseUrl) return undefined;
      return `${baseUrl}/verify-email?email=${encodeURIComponent(normalizedEmail)}&code=${encodeURIComponent(code)}`;
    } catch (error) {
      this.logger.warn(
        `Skipping OTP verify link (base URL unavailable): ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  private async expireOldOtps(normalizedEmail: string, purpose: OtpPurpose) {
    await this.otpRepository.update(
      {
        normalizedEmail,
        purpose,
        usedAt: IsNull(),
        expiresAt: LessThan(new Date()),
      },
      { usedAt: new Date() },
    );
  }

  private async enforceResendCooldown(
    normalizedEmail: string,
    purpose: OtpPurpose,
  ) {
    const latestOtp = await this.otpRepository.findOne({
      where: {
        normalizedEmail,
        purpose,
        usedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    if (
      latestOtp?.resendAvailableAt &&
      latestOtp.resendAvailableAt.getTime() > Date.now()
    ) {
      const waitSeconds = Math.ceil(
        (latestOtp.resendAvailableAt.getTime() - Date.now()) / 1000,
      );
      throw new BadRequestException(
        `Please wait ${waitSeconds} seconds before requesting a new code.`,
      );
    }
  }
}
