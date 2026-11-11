import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ExchangeMetaOAuthCodeDto {
  @ApiPropertyOptional({
    description:
      'Meta authorization code from the login dialog. Omit when completing a stored page selection.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  code?: string;

  @ApiPropertyOptional({
    description:
      'Redirect URI used in the login dialog. Must exactly match the callback URL shown in platform-console Channel settings.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  redirectUri?: string;

  @ApiPropertyOptional({
    description:
      'Single-use state issued by POST tenant/channels/meta/state. Omit when completing a stored page selection.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  state?: string;

  @ApiPropertyOptional({
    description: 'Facebook Page ID chosen from a multi-page selection.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  pageId?: string;

  @ApiPropertyOptional({
    description:
      'Single-use selection token from a needsPageSelection response. Omit on the first exchange call.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  selectionToken?: string;
}
