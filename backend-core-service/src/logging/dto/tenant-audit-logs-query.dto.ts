import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class TenantAuditLogsQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter audit logs to a single team member id',
  })
  @IsOptional()
  @IsString()
  userId?: string;
}
