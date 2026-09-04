import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Put,
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
  ConfirmEmailVerificationDto,
  ResendEmailVerificationDto,
} from './dto/email-verification.dto';
import { RegisterWorkspaceDto } from './dto/register-workspace.dto';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/tenant.decorator';
import { normalizeIdentityEmail } from './identity-email.util';

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
export class AuthController {
  constructor(private authService: AuthService) {}

  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
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

  @ApiOperation({ summary: 'Confirm workspace email verification' })
  @Throttle({
    default: {
      limit: Number(
        process.env.AUTH_EMAIL_VERIFICATION_CONFIRM_RATE_LIMIT || 10,
      ),
      ttl: 60_000,
    },
  })
  @Post('email-verification/confirm')
  confirmEmailVerification(
    @Body() verificationDto: ConfirmEmailVerificationDto,
  ) {
    return this.authService.confirmEmailVerification(verificationDto.token);
  }

  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiBearerAuth()
  @UseGuards(RefreshJwtAuthGuard)
  @Post('refresh')
  async refreshToken(@Request() req) {
    return this.authService.refreshToken(req.user);
  }

  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Request() req) {
    // Update user status to offline
    await this.authService.updateUserStatus(req.user.id, req.user.type, false);
    return { message: 'Logout successful' };
  }
}
