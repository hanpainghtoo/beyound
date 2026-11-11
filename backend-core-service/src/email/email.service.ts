import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { teamInviteTemplate } from './templates/team-invite';
import { accountCreatedTemplate } from './templates/account-created';
import { passwordResetTemplate } from './templates/password-reset';
import { emailVerificationTemplate } from './templates/email-verification';
import { invoiceIssuedTemplate } from './templates/invoice-issued';
import { otpCodeTemplate } from './templates/otp-code';

export class EmailDeliveryError extends Error {
  readonly code = 'EMAIL_DELIVERY_FAILED';

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] || character,
  );
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    this.logger.log(
      `EmailService initializing - SMTP_HOST: ${host}, SMTP_USER: ${user ? '***' : 'undefined'}`,
    );
    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.configService.get<number>('SMTP_PORT', 587),
        secure: this.configService.get<number>('SMTP_PORT', 587) === 465,
        auth: {
          user: this.configService.get<string>('SMTP_USER'),
          pass: this.configService.get<string>('SMTP_PASS'),
        },
      });
      this.logger.log('EmailService transporter created successfully');
    } else if (host) {
      this.logger.error(
        'SMTP_HOST is configured but SMTP_USER or SMTP_PASS is missing — email delivery unavailable',
      );
    } else {
      this.logger.warn('SMTP_HOST not configured — email delivery unavailable');
    }
  }

  private getFromAddress(): string {
    return this.configService.get<string>('SMTP_FROM', 'noreply@kme.app');
  }

  private async sendMail(
    to: string,
    subject: string,
    html: string,
  ): Promise<boolean> {
    if (!this.transporter) {
      const error = new EmailDeliveryError(
        'SMTP email delivery is not configured.',
      );
      this.logger.error(error.message);
      throw error;
    }

    try {
      await this.transporter.sendMail({
        from: this.getFromAddress(),
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to} (${subject})`);
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send email to ${to}: ${reason}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new EmailDeliveryError(
        `SMTP email delivery failed for ${to}.`,
        error,
      );
    }
  }

  async sendTeamInvite(
    to: string,
    options: {
      inviteUrl: string;
      logoUrl?: string;
      role: string;
      companyName: string;
      inviterName: string;
      expiresAt: Date;
    },
  ): Promise<boolean> {
    return this.sendMail(
      to,
      `You've been invited as ${options.role}`,
      teamInviteTemplate(options),
    );
  }

  async sendPaymentMethodsPublished(
    to: string,
    options: { actorName: string; version: number; methodKinds: string[] },
  ): Promise<boolean> {
    return this.sendMail(
      to,
      `Payment methods updated — version ${options.version}`,
      `<p>Your workspace payment methods were updated by <strong>${escapeHtml(options.actorName)}</strong>.</p><p>Published version: <strong>${options.version}</strong><br/>Enabled methods: ${options.methodKinds.map(escapeHtml).join(', ') || 'none'}</p><p>Review the change in your ZayOS workspace.</p>`,
    );
  }

  /**
   * Direct team-member creation: the owner/manager chose the initial password
   * in the workspace UI. It only exists in plaintext for the duration of that
   * request (bcrypt-hashed on write, never stored), so this email is the one
   * place it can be handed to the member together with the sign-in link.
   */
  async sendAccountCreated(
    to: string,
    options: {
      signInUrl: string;
      logoUrl?: string;
      password: string;
      email: string;
      fullName: string;
      role: string;
      companyName: string;
      inviterName: string;
    },
  ): Promise<boolean> {
    return this.sendMail(
      to,
      `Your ZayOS sign-in details for ${options.companyName}`,
      accountCreatedTemplate(options),
    );
  }

  async sendPasswordReset(
    to: string,
    options: {
      resetUrl: string;
      userType: string;
      expiresAt: Date;
    },
  ): Promise<boolean> {
    return this.sendMail(
      to,
      'Reset your password',
      passwordResetTemplate(options),
    );
  }

  async sendEmailVerification(
    to: string,
    options: {
      verificationUrl: string;
      expiresAt: Date;
    },
  ): Promise<boolean> {
    return this.sendMail(
      to,
      'Verify your email address',
      emailVerificationTemplate(options),
    );
  }

  // Plan 30: invoice-issued notice to the COMPANY email. Delivery failures
  // are logged and propagated so callers can report the real outcome.
  async sendInvoiceIssued(
    to: string,
    options: {
      companyName: string;
      invoiceNo: string;
      planName: string;
      billingPeriodLabel: string;
      amountDue: string;
      invoiceUrl: string;
      lineDescription: string;
      paymentMethodLabel?: string | null;
      paymentAccount?: string | null;
      requestNote?: string | null;
    },
  ): Promise<boolean> {
    const sent = await this.sendMail(
      to,
      `Invoice ${options.invoiceNo} is ready`,
      invoiceIssuedTemplate(options),
    );
    if (sent) {
      this.logger.log(`Invoice email sent to ${to} (${options.invoiceNo})`);
    } else {
      this.logger.warn(
        `Invoice email NOT sent to ${to} (${options.invoiceNo}) — delivery unavailable, see earlier errors`,
      );
    }
    return sent;
  }

  async sendOtpEmail(
    to: string,
    options: {
      code: string;
      expiresAt: Date;
      purpose: string;
      verifyUrl?: string;
    },
  ): Promise<boolean> {
    return this.sendMail(
      to,
      'Your verification code',
      otpCodeTemplate(options),
    );
  }
}
