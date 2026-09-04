import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { teamInviteTemplate } from './templates/team-invite';
import { passwordResetTemplate } from './templates/password-reset';
import { emailVerificationTemplate } from './templates/email-verification';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.configService.get<number>('SMTP_PORT', 587),
        secure: this.configService.get<number>('SMTP_PORT', 587) === 465,
        auth: {
          user: this.configService.get<string>('SMTP_USER'),
          pass: this.configService.get<string>('SMTP_PASS'),
        },
      });
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
    if (!this.transporter) return false;

    try {
      await this.transporter.sendMail({
        from: this.getFromAddress(),
        to,
        subject,
        html,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error}`);
      return false;
    }
  }

  async sendTeamInvite(
    to: string,
    options: {
      inviteUrl: string;
      role: string;
      invitedBy?: string;
      expiresAt: Date;
    },
  ): Promise<boolean> {
    return this.sendMail(
      to,
      `You've been invited as ${options.role}`,
      teamInviteTemplate(options),
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
}
