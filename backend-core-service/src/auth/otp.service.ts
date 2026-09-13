import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan } from 'typeorm';
import type { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { Otp, type OtpPurpose } from './entities/otp.entity';
import { EmailService } from '../email/email.service';

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 3;
const RESEND_COOLDOWN_SECONDS = 60;

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
  ): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    await this.expireOldOtps(normalizedEmail, purpose);
    await this.enforceResendCooldown(normalizedEmail, purpose);

    const code = String(randomInt(100000, 999999));
    const codeHash = await bcrypt.hash(code, 10);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);
    const resendAvailableAt = new Date(
      now.getTime() + RESEND_COOLDOWN_SECONDS * 1_000,
    );

    await this.otpRepository.save(
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
        : 'sign in';
    const sent = await this.emailService.sendOtpEmail(normalizedEmail, {
      code,
      expiresAt,
      purpose: purposeLabel,
    });

    if (!sent) {
      this.logger.warn(`OTP email delivery unavailable for ${normalizedEmail}`);
    }

    return {
      message: 'If an account exists, a verification code has been sent.',
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
        'Verification code has expired. Please request a new one.',
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
