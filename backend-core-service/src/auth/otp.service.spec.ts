import { BadRequestException } from '@nestjs/common';
import {
  OtpService,
  EMAIL_VERIFICATION_EXPIRY_SECONDS,
  OTP_EXPIRY_SECONDS,
} from './otp.service';

describe('OtpService email verification expiry', () => {
  const repository = {
    update: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest
      .fn()
      .mockImplementation((value: unknown) => Promise.resolve(value)),
  };
  const emailService = { sendOtpEmail: jest.fn().mockResolvedValue(true) };
  let service: OtpService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-13T12:00:00.000Z'));
    jest.clearAllMocks();
    repository.findOne.mockResolvedValue(null);
    service = new OtpService(repository as never, emailService as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses a fresh 120-second window for email verification OTPs', async () => {
    const result = await service.generate(
      'Owner@Example.com',
      'email_verification',
    );

    expect(result.expiresInSeconds).toBe(EMAIL_VERIFICATION_EXPIRY_SECONDS);
    expect(result.expiresAt).toBe('2026-09-13T12:02:00.000Z');
    expect(result.resendAvailableAt).toBe('2026-09-13T12:02:00.000Z');
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt: new Date('2026-09-13T12:02:00.000Z'),
        resendAvailableAt: new Date('2026-09-13T12:02:00.000Z'),
      }),
    );
  });

  it('keeps the existing 10-minute expiry for other OTP purposes', async () => {
    const result = await service.generate('Owner@Example.com', 'otp_login');

    expect(result.expiresInSeconds).toBe(OTP_EXPIRY_SECONDS);
    expect(result.expiresAt).toBe('2026-09-13T12:10:00.000Z');
  });

  it('rejects an email verification code at the expiry boundary', async () => {
    repository.findOne.mockResolvedValue({
      expiresAt: new Date('2026-09-13T12:00:00.000Z'),
      attemptCount: 0,
      maxAttempts: 3,
      codeHash: 'hash',
    });

    await expect(
      service.verify('owner@example.com', '123456', 'email_verification'),
    ).rejects.toThrow(
      new BadRequestException('OTP expired. Please request a new code.'),
    );
  });
});
