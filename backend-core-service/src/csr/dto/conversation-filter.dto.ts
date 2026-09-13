import {
  IsOptional,
  IsEnum,
  IsString,
  IsDateString,
  IsIn,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ConversationFilterDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: ['all', 'unread', 'assigned', 'team', 'hot_leads', 'vip', 'overdue'],
  })
  @IsOptional()
  @IsIn(['all', 'unread', 'assigned', 'team', 'hot_leads', 'vip', 'overdue'])
  filter?: string;

  @ApiPropertyOptional({ enum: ['open', 'pending', 'resolved', 'closed'] })
  @IsOptional()
  @IsIn(['open', 'pending', 'resolved', 'closed'])
  declare status?: string;

  @ApiPropertyOptional({ enum: ['low', 'normal', 'high', 'urgent'] })
  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  channelType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedCsrId?: string;

  @ApiPropertyOptional({ enum: ['normal', 'due_soon', 'overdue'] })
  @IsOptional()
  @IsIn(['normal', 'due_soon', 'overdue'])
  slaState?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  declare dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  declare dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;
}
