import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseFilters,
  Request,
  Get,
  Put,
  Query,
  Param,
  Optional,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshJwtAuthGuard } from './guards/refresh-jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterTenantUserDto } from './dto/register-tenant-user.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  ResendEmailVerificationDto,
  VerifyEmailOtpDto,
} from './dto/email-verification.dto';
import { RegisterWorkspaceDto } from './dto/register-workspace.dto';
import { RegisterFromPricingDto } from './dto/register-from-pricing.dto';
import { RegisterPaymentProofUploadDto } from './dto/register-payment-proof-upload.dto';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { normalizeIdentityEmail } from './identity-email.util';
import { AuthThrottleExceptionFilter } from './filters/auth-throttle-exception.filter';
import { WebSocketService } from '../websocket/websocket.service';

function emailAwareThrottleTracker(req: Record<string, any>) {
  const source =
    req.ip ||
    (Array.isArray(req.ips) && req.ips.length > 0
      ? req.ips.join(',')
      : undefined) ||
    req.socket?.remoteAddress ||
    'unknown-source';
  let normalizedEmail = 'unknown-email';
  const email =
    typeof req.body?.email === 'string' ? req.body.email : req.body?.workEmail;
  if (typeof email === 'string') {
    try {
      normalizedEmail = normalizeIdentityEmail(email);
    } catch {
      normalizedEmail = 'invalid-email';
    }
  }

  return `${source}:${normalizedEmail}`;
}

@ApiTags('Authentication')
@Controller('auth')
@UseFilters(AuthThrottleExceptionFilter)
export class AuthController {
  constructor(
    private authService: AuthService,
    @Optional() private readonly webSocketService: WebSocketService,
  ) {}

  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Incorrect email or password' })
  @Throttle({
    default: {
      limit: Number(process.env.AUTH_LOGIN_RATE_LIMIT || 10),
      ttl: 60_000,
    },
  })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(
    @Request() req,
    @Body() loginDto: LoginDto,
  ): Promise<AuthResponseDto> {
    return this.authService.login(req.user);
  }

  @ApiOperation({ summary: 'Get public context for a team invitation' })
  @ApiResponse({ status: 200, description: 'Invitation context retrieved' })
  @ApiResponse({ status: 400, description: 'Invitation is invalid or expired' })
  @Get('invites/:token')
  getTenantInviteContext(@Param('token') token: string) {
    return this.authService.getTenantInviteContext(token);
  }

  @ApiOperation({ summary: 'Register tenant user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  @Throttle({
    default: {
      limit: Number(process.env.AUTH_REGISTER_RATE_LIMIT || 5),
      ttl: 60_000,
      getTracker: emailAwareThrottleTracker,
    },
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles('admin')
  @Post('register/tenant-user')
  async registerTenantUser(
    @CurrentTenant() tenant: { id: string },
    @Body() registerDto: RegisterTenantUserDto,
  ) {
    const user = await this.authService.registerTenantUser(
      tenant.id,
      registerDto,
    );
    const { passwordHash, normalizedEmail: _normalizedEmail, ...result } = user;
    return result;
  }

  @ApiOperation({ summary: 'Register a self-serve merchant workspace' })
  @ApiResponse({
    status: 201,
    description: 'Workspace registered successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Workspace user already exists' })
  @Throttle({
    default: {
      limit: Number(process.env.AUTH_REGISTER_RATE_LIMIT || 5),
      ttl: 60_000,
      getTracker: emailAwareThrottleTracker,
    },
  })
  @Post('register/workspace')
  async registerWorkspace(
    @Body() registerDto: RegisterWorkspaceDto,
    @Request() req,
  ): Promise<AuthResponseDto> {
    return this.authService.registerWorkspace(registerDto, {
      ipAddress: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  @ApiBearerAuth()
  @Throttle({
    default: {
      limit: Number(process.env.AUTH_REFRESH_RATE_LIMIT || 20),
      ttl: 60_000,
    },
  })
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }

  @ApiOperation({
    summary: 'Update current tenant-user profile and preferences',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Put('profile')
  updateProfile(@Request() req, @Body() updateDto: UpdateProfileDto) {
    return this.authService.updateCurrentUser(
      req.user.id,
      req.user.type,
      updateDto,
    );
  }

  @ApiOperation({ summary: 'Change current tenant-user password' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(@Request() req, @Body() changePasswordDto: ChangePasswordDto) {
    return this.authService.changePassword(
      req.user.id,
      req.user.type,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
  }

  @ApiOperation({ summary: 'Request a password reset link' })
  @Throttle({
    default: {
      limit: Number(process.env.AUTH_PASSWORD_RESET_RATE_LIMIT || 5),
      ttl: 60_000,
      getTracker: emailAwareThrottleTracker,
    },
  })
  @Post('password-reset/request')
  requestPasswordReset(@Body() resetDto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(
      resetDto.email,
      resetDto.userType,
    );
  }

  @ApiOperation({ summary: 'Reset password using a one-time token' })
  @Throttle({
    default: {
      limit: Number(process.env.AUTH_PASSWORD_RESET_CONFIRM_RATE_LIMIT || 10),
      ttl: 60_000,
    },
  })
  @Post('password-reset/confirm')
  resetPassword(@Body() resetDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetDto.token, resetDto.newPassword);
  }

  @ApiOperation({ summary: 'Request a workspace email verification link' })
  @Throttle({
    default: {
      limit: Number(process.env.AUTH_EMAIL_VERIFICATION_RESEND_RATE_LIMIT || 5),
      ttl: 60_000,
      getTracker: emailAwareThrottleTracker,
    },
  })
  @Post('email-verification/resend')
  requestEmailVerification(
    @Body() verificationDto: ResendEmailVerificationDto,
  ) {
    return this.authService.requestEmailVerification(verificationDto.email);
  }

  @ApiOperation({ summary: 'Verify workspace email with an OTP and sign in' })
  @Throttle({
    default: {
      limit: Number(
        process.env.AUTH_EMAIL_VERIFICATION_CONFIRM_RATE_LIMIT || 10,
      ),
      ttl: 60_000,
    },
  })
  @Post('email-verification/verify')
  verifyEmailWithOtp(@Body() body: VerifyEmailOtpDto) {
    return this.authService.verifyEmailWithOtp(body.email, body.code);
  }

  /** @deprecated The public endpoint now verifies email with OTP. */
  @Throttle({
    default: {
      limit: Number(
        process.env.AUTH_EMAIL_VERIFICATION_CONFIRM_RATE_LIMIT || 10,
      ),
      ttl: 60_000,
    },
  })
  @Post('email-verification/confirm')
  confirmEmailVerification(@Body() body: { token: string }) {
    return this.authService.confirmEmailVerification(body.token);
  }

  @ApiOperation({ summary: 'Check if an email already has an account' })
  @Throttle({
    default: {
      limit: Number(process.env.AUTH_EMAIL_VERIFICATION_CHECK_RATE_LIMIT || 10),
      ttl: 60_000,
      getTracker: emailAwareThrottleTracker,
    },
  })
  @Get('email-verification/check')
  checkEmailExists(@Query('email') email: string) {
    return this.authService.checkEmailExists(email);
  }

  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiBearerAuth()
  @UseGuards(RefreshJwtAuthGuard)
  @Post('refresh')
  async refreshToken(@Request() req) {
    return this.authService.refreshToken(req.user);
  }

  @ApiOperation({
    summary: 'Register merchant from pricing page (creates account + billing)',
  })
  @ApiResponse({
    status: 201,
    description: 'Registration initiated, OTP sent',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @Throttle({
    default: {
      limit: Number(process.env.AUTH_REGISTER_RATE_LIMIT || 5),
      ttl: 60_000,
      getTracker: emailAwareThrottleTracker,
    },
  })
  @Post('register/from-pricing')
  async registerFromPricing(
    @Body() registerDto: RegisterFromPricingDto,
    @Request() req,
  ) {
    return this.authService.registerFromPricing(registerDto, {
      ipAddress: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @ApiOperation({
    summary: 'Create a signed payment receipt upload for pricing registration',
  })
  @ApiResponse({
    status: 201,
    description: 'Signed upload slot created; PUT the file bytes to uploadUrl',
  })
  @Throttle({
    default: {
      limit: Number(process.env.AUTH_REGISTER_RATE_LIMIT || 5),
      ttl: 60_000,
      getTracker: emailAwareThrottleTracker,
    },
  })
  @Post('register/payment-proof-upload')
  async createRegistrationPaymentProofUpload(
    @Body() input: RegisterPaymentProofUploadDto,
  ) {
    return this.authService.createRegistrationPaymentProofUpload(input);
  }

  @ApiOperation({ summary: 'Sign in with OTP (for new pricing registration)' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified, login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @Throttle({
    default: {
      limit: Number(process.env.AUTH_LOGIN_RATE_LIMIT || 10),
      ttl: 60_000,
    },
  })
  @Post('otp-login')
  async otpLogin(
    @Body() body: { email: string; code: string },
  ): Promise<AuthResponseDto> {
    return this.authService.otpLogin(body.email, body.code);
  }

  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Request() req) {
    await this.authService.updateUserStatus(req.user.id, req.user.type, false);
    this.webSocketService?.forceOffline(req.user.tenantId, req.user.id);
    return { message: 'Logout successful' };
  }
}
