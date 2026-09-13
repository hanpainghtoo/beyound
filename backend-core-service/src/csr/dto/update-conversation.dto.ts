import {
  IsOptional,
  IsEnum,
  IsString,
  IsArray,
  IsNumber,
  IsDateString,
  IsIn,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateConversationDto {
  @ApiPropertyOptional({ enum: ['open', 'pending', 'resolved', 'closed'] })
  @IsOptional()
  @IsIn(['open', 'pending', 'resolved', 'closed'])
  status?: string;

  @ApiPropertyOptional({ enum: ['low', 'normal', 'high', 'urgent'] })
  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedCsrId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  customerSatisfactionRating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerFeedback?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  slaDueAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  closeReason?: string;
}
