import { IsString, IsOptional, IsEnum, IsArray, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCannedResponseDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortcut?: string;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  tags?: string[];

  @ApiPropertyOptional({ enum: ['public', 'private', 'team'] })
  @IsOptional()
  @IsIn(['public', 'private', 'team'])
  visibility?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  /**
   * Photo stored in the file-storage service. `null` clears it — `undefined`
   * is dropped by the service's Object.assign and would keep the old value.
   */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  imageMediaId?: string | null;
}
