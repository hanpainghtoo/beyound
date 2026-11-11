import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { OtpService } from './otp.service';
import { GenerateOtpDto } from './dto/generate-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@ApiTags('OTP')
@Controller('otp')
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @ApiOperation({ summary: 'Generate and send OTP code' })
  @ApiResponse({ status: 200, description: 'OTP sent' })
  @Throttle({
    default: {
      limit: Number(process.env.OTP_GENERATE_RATE_LIMIT || 3),
      ttl: 60_000,
    },
  })
  @Post('generate')
  async generate(@Body() dto: GenerateOtpDto) {
    return this.otpService.generate(dto.email, dto.purpose, {
      paymentId: dto.paymentId,
    });
  }

  @ApiOperation({ summary: 'Verify OTP code' })
  @ApiResponse({ status: 200, description: 'OTP verified' })
  @Throttle({
    default: {
      limit: Number(process.env.OTP_VERIFY_RATE_LIMIT || 5),
      ttl: 60_000,
    },
  })
  @Post('verify')
  async verify(@Body() dto: VerifyOtpDto) {
    return this.otpService.verify(dto.email, dto.code, dto.purpose);
  }
}
